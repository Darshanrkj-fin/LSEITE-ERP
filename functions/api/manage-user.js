import { createClient } from '@supabase/supabase-js'
import { isValidUsername } from '../../src/config/auth.js'
import { createUser, resetPassword } from '../../lib/userAdmin.js'

// Same create-user/reset-password actions as scripts/manage-user.js, gated
// to the caller's own admin role instead of local terminal access. The
// service-role key never leaves this function and is only ever
// constructed AFTER the caller is confirmed to be an admin.
// Cloudflare only calls onRequestPost for a POST — any other method falls
// through unmatched to static-asset/SPA-fallback serving instead of a
// clean error, so it needs its own explicit handler here (mirrors the
// original Vercel handler's `req.method !== 'POST'` check).
export function onRequestGet() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function onRequestPost(context) {
  const { request, env } = context
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  // Identify the caller from their own forwarded session (anon key +
  // their access token, same pattern as functions/api/invoice-pdf.js) and
  // confirm admin role via their own RLS-scoped profile row — this can
  // only ever read the caller's own row, never anyone else's.
  const callerClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData?.user) {
    return Response.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await callerClient
    .from('users')
    .select('role, can_manage_users')
    .eq('id', userData.user.id)
    .single()
  if (profileError || profile?.role !== 'admin' || !profile?.can_manage_users) {
    return Response.json({ error: 'Not authorized to manage users' }, { status: 403 })
  }

  const { action, username, password } = await request.json().catch(() => ({}))
  if (!action || !username || !password) {
    return Response.json({ error: 'action, username and password are required' }, { status: 400 })
  }
  if (!isValidUsername(username)) {
    return Response.json(
      { error: 'Username can only contain letters, numbers, dots, underscores and hyphens.' },
      { status: 400 }
    )
  }
  if (password.length < 6) {
    return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  if (action !== 'create-user' && action !== 'reset-password') {
    return Response.json({ error: 'action must be "create-user" or "reset-password"' }, { status: 400 })
  }

  const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result =
    action === 'create-user'
      ? await createUser(adminClient, username, password)
      : await resetPassword(adminClient, username, password)

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  return Response.json(result)
}
