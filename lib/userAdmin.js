// Shared by scripts/manage-user.js (local CLI) and api/manage-user.js (web
// admin page) so the create/reset logic exists in exactly one place.
// Every function here takes an already-constructed service-role Supabase
// client — this module never reads env vars or decides who's allowed to
// call it; that's each caller's job (the CLI trusts whoever has the
// service-role key locally, the API route checks the caller's own admin
// role first).
import { usernameToEmail } from '../src/config/auth.js'

export async function findUserByEmail(supabase, email) {
  // supabase-js's admin API has no "get user by email" call — list and
  // find client-side. Fine at this scale (a handful of internal users).
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === email)
}

export async function createUser(supabase, username, password) {
  const email = usernameToEmail(username)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no real inbox exists to confirm from
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, email, id: data.user.id }
}

export async function resetPassword(supabase, username, password) {
  const email = usernameToEmail(username)
  const user = await findUserByEmail(supabase, email)
  if (!user) return { ok: false, error: `No user found for username "${username}" (${email}).` }
  const { error } = await supabase.auth.admin.updateUserById(user.id, { password })
  if (error) return { ok: false, error: error.message }
  return { ok: true, email }
}
