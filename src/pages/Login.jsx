import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isValidUsername, usernameToEmail } from '../config/auth'

// Sign-in only. Accounts are created by an admin directly in the Supabase
// dashboard (Authentication > Users > Add user) — see the README note in
// supabase/schema.sql for the "Auto Confirm User" requirement.
export function Login() {
  const { session, signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!isValidUsername(username)) {
      setError('Username can only contain letters, numbers, dots, underscores and hyphens.')
      return
    }

    setSubmitting(true)
    const { error: authError } = await signIn(usernameToEmail(username), password)
    setSubmitting(false)

    if (authError) {
      setError(authError.message)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-paper">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-line bg-mist p-6"
      >
        <img src="/lseite-logo.jpg" alt="Lseite" className="mx-auto mb-4 h-16 w-16 rounded-full object-cover" />
        <h1 className="font-display mb-4 text-center text-lg font-semibold text-ink">Sign in</h1>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-muted">Username</span>
          <input
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-muted">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && <p className="mb-3 text-sm text-clay">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-ink py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Please wait…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
