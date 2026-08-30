#!/usr/bin/env node
// Local admin CLI for creating/resetting user accounts directly via the
// Supabase Admin API — bypasses the dashboard's "Reset password"/"Magic
// link" buttons, which only work by sending a real email and can never
// reach our fake @internal.lseite.local addresses.
//
// Uses SUPABASE_SERVICE_ROLE_KEY, so this must only ever run locally from
// a terminal — never import this file from src/ or expose it to the
// frontend build. Vite only bundles what's reachable from index.html's
// import graph, and nothing under src/ imports this file, so it's already
// excluded automatically.
//
// The same actions are also available, admin-login-gated, from the app
// itself (Manage Users page / api/manage-user.js) — both share the actual
// create/reset logic via lib/userAdmin.js.
//
// Usage:
//   node scripts/manage-user.js create-user <username> <password>
//   node scripts/manage-user.js reset-password <username> <password>

import { createClient } from '@supabase/supabase-js'
import { isValidUsername } from '../src/config/auth.js'
import { createUser, resetPassword } from '../lib/userAdmin.js'

process.loadEnvFile()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function usage() {
  console.error('Usage:')
  console.error('  node scripts/manage-user.js create-user <username> <password>')
  console.error('  node scripts/manage-user.js reset-password <username> <password>')
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env')
    return false
  }

  const [, , command, username, password] = process.argv

  if (!command || !username || !password) {
    usage()
    return false
  }
  if (!isValidUsername(username)) {
    console.error('Username can only contain letters, numbers, dots, underscores and hyphens.')
    return false
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.')
    return false
  }
  if (command !== 'create-user' && command !== 'reset-password') {
    usage()
    return false
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result =
    command === 'create-user'
      ? await createUser(supabase, username, password)
      : await resetPassword(supabase, username, password)

  if (!result.ok) {
    console.error(`Failed: ${result.error}`)
    return false
  }
  if (command === 'create-user') {
    console.log(`Created user "${username}" (${result.email}), id ${result.id}.`)
    console.log(
      'Role is assigned automatically: the first user ever created becomes admin, everyone after becomes viewer. Promote/demote via Table Editor > users > role if needed.'
    )
  } else {
    console.log(`Password reset for "${username}" (${result.email}).`)
  }
  return true
}

// Setting exitCode (rather than calling process.exit()) lets Node drain
// the event loop normally on the way out — calling process.exit()
// straight after an admin API call crashes on Windows with a native
// libuv assertion (a lingering fetch keep-alive handle), which would
// otherwise bury the real error message under a confusing crash.
const ok = await main()
if (!ok) process.exitCode = 1
