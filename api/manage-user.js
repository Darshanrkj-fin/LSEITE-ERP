import { createClient } from '@supabase/supabase-js'
import { isValidUsername } from '../src/config/auth.js'
import { createUser, resetPassword } from '../lib/userAdmin.js'

// Same create-user/reset-password actions as scripts/manage-user.js, gated
// to the caller's own admin role instead of local terminal access. The
// service-role key never leaves this function and is only ever
// constructed AFTER the caller is confirmed to be an admin.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return
  }

  // Identify the caller from their own forwarded session (anon key +
  // their access token, same pattern as api/invoice-pdf.js) and confirm
  // admin role via their own RLS-scoped profile row — this can only ever
  // read the caller's own row, never anyone else's.
  const callerClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  const { data: profile, error: profileError } = await callerClient
    .from('users')
    .select('role, can_manage_users')
    .eq('id', userData.user.id)
    .single()
  if (profileError || profile?.role !== 'admin' || !profile?.can_manage_users) {
    res.status(403).json({ error: 'Not authorized to manage users' })
    return
  }

  const { action, username, password } = req.body ?? {}
  if (!action || !username || !password) {
    res.status(400).json({ error: 'action, username and password are required' })
    return
  }
  if (!isValidUsername(username)) {
    res.status(400).json({ error: 'Username can only contain letters, numbers, dots, underscores and hyphens.' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' })
    return
  }
  if (action !== 'create-user' && action !== 'reset-password') {
    res.status(400).json({ error: 'action must be "create-user" or "reset-password"' })
    return
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result =
    action === 'create-user'
      ? await createUser(adminClient, username, password)
      : await resetPassword(adminClient, username, password)

  if (!result.ok) {
    res.status(400).json({ error: result.error })
    return
  }
  res.status(200).json(result)
}
