import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyForm = { action: 'create-user', username: '', password: '' }
const ROLES = ['admin', 'accountant', 'viewer']

export function ManageUsers() {
  const { profile, session } = useAuth()
  const canManageUsers = profile?.role === 'admin' && profile?.can_manage_users

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const loadUsers = async () => {
    setUsersLoading(true)
    const { data, error: fetchError } = await supabase
      .from('users')
      .select('id, full_name, role, can_manage_users')
      .order('full_name')
    if (fetchError) setUsersError(fetchError.message)
    else setUsers(data ?? [])
    setUsersLoading(false)
  }

  useEffect(() => {
    if (canManageUsers) loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageUsers])

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
    if (form.action === 'create-user') loadUsers()
  }

  const updateUserField = (id, field, value) => {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
  }

  const saveUser = async (user) => {
    setUsersError(null)
    setSavingId(user.id)
    const { error: rpcError } = await supabase.rpc('update_user_role', {
      p_user_id: user.id,
      p_role: user.role,
      p_can_manage_users: user.can_manage_users,
    })
    setSavingId(null)
    if (rpcError) {
      setUsersError(rpcError.message)
      return
    }
    loadUsers()
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="mb-1 text-xl font-semibold font-display text-ink">Manage Users</h1>
        <p className="mb-6 text-sm text-muted">
          Create a user or reset a password directly — no email is ever sent, since usernames map to a fake
          internal address.
        </p>

        <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
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

      <div>
        <h2 className="mb-1 text-sm font-semibold text-ink">Roles &amp; permissions</h2>
        <p className="mb-4 text-sm text-muted">
          Only an admin with "Can manage users" can change these. You can't edit your own row here — ask another
          admin, or use the Supabase Table Editor.
        </p>

        {usersError && <p className="mb-4 text-sm text-clay">{usersError}</p>}

        {usersLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-muted">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Can manage users</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === profile.id
                return (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      {u.full_name || '—'}
                      {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        disabled={isSelf}
                        value={u.role}
                        onChange={(e) => updateUserField(u.id, 'role', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="checkbox"
                        disabled={isSelf || u.role !== 'admin'}
                        checked={u.can_manage_users}
                        onChange={(e) => updateUserField(u.id, 'can_manage_users', e.target.checked)}
                        className="disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      {!isSelf && (
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => saveUser(u)}
                          className="text-sm text-ink hover:underline disabled:opacity-50"
                        >
                          {savingId === u.id ? 'Saving…' : 'Save'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-muted">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
