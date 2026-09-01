import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const emptyForm = { action: 'create-user', username: '', password: '' }

export function ManageUsers() {
  const { profile, session } = useAuth()
  const canManageUsers = profile?.role === 'admin' && profile?.can_manage_users

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!canManageUsers) {
    return <p className="text-muted">You don't have access to this page.</p>
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    const response = await fetch('/api/manage-user', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form),
    })
    const body = await response.json().catch(() => ({}))
    setSubmitting(false)

    if (!response.ok) {
      setError(body.error ?? `Request failed (HTTP ${response.status})`)
      return
    }

    setInfo(
      form.action === 'create-user'
        ? `Created user "${form.username}" (${body.email}).`
        : `Password reset for "${form.username}" (${body.email}).`
    )
    setForm((f) => ({ ...f, password: '' }))
  }

  return (
    <div className="max-w-sm">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Manage Users</h1>
      <p className="mb-6 text-sm text-muted">
        Create a user or reset a password directly — no email is ever sent, since usernames map to a fake internal
        address.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Action</span>
          <select
            value={form.action}
            onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="create-user">Create user</option>
            <option value="reset-password">Reset password</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Username</span>
          <input
            type="text"
            required
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-clay">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Working…' : form.action === 'create-user' ? 'Create user' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}
