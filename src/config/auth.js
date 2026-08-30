// Supabase Auth is email/password only — there is no native "username" mode.
// To show a Username field in the UI while still using Supabase Auth (no
// custom auth system), every username is mapped to a fake internal email
// before it ever reaches Supabase: "admin" -> "admin@internal.lseite.local".
// Change the domain here only; nothing else should hardcode it.
export const USERNAME_AUTH_DOMAIN = '@internal.lseite.local'

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}${USERNAME_AUTH_DOMAIN}`
}

export function emailToUsername(email) {
  return email?.endsWith(USERNAME_AUTH_DOMAIN)
    ? email.slice(0, -USERNAME_AUTH_DOMAIN.length)
    : email
}

export function isValidUsername(username) {
  return USERNAME_PATTERN.test(username)
}
