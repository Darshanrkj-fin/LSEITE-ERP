import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export function AccessRequests() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [employees, setEmployees] = useState([])
  const [grants, setGrants] = useState([])
  const [myRoles, setMyRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const [employeeId, setEmployeeId] = useState('')
  const [systemName, setSystemName] = useState('')
  const [accessLevel, setAccessLevel] = useState('read')
  const [reason, setReason] = useState('')

  const canRevoke = profile?.role === 'admin' || profile?.role === 'accountant' || myRoles.includes('cto')

  const load = async () => {
    setLoading(true)
    const [{ data: emps }, { data: grantRows, error: fetchError }, { data: roleRows }] = await Promise.all([
      supabase.from('employees').select('id, name').eq('status', 'active').order('name'),
      supabase
        .from('access_grants')
        .select('*, employees(name)')
        .order('granted_at', { ascending: false }),
      supabase.from('user_app_roles').select('app_role').eq('user_id', profile.id),
    ])
    setEmployees(emps ?? [])
    if (fetchError) setError(fetchError.message)
    else setGrants(grantRows ?? [])
    setMyRoles((roleRows ?? []).map((r) => r.app_role))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { data: request, error: rpcError } = await supabase.rpc('submit_access_request', {
      p_employee_id: employeeId,
      p_system_name: systemName,
      p_access_level: accessLevel,
      p_reason: reason || null,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    } else {
      setInfo('Access granted.')
    }
    setSystemName('')
    setReason('')
    load()
  }

  const handleRevoke = async (grantId) => {
    setError(null)
    setBusyId(grantId)
    const { error: rpcError } = await supabase.rpc('revoke_access', { p_grant_id: grantId, p_reason: null })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Technology Access Requests</h1>
      <p className="mb-6 text-sm text-muted">
        A tracked request/approval record — this app can't actually provision access on an external
        system (AWS, a vendor portal, a production database). Once approved, whoever holds the access
        still has to go set it up outside this app; this is the audit trail of that decision.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {canEdit && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded border border-line p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Employee</span>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">System / tool</span>
              <input
                required
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="e.g. Production Database"
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Access level</span>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Request Access'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Employee</th>
            <th className="py-2 pr-4">System</th>
            <th className="py-2 pr-4">Level</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Granted</th>
            {canRevoke && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{g.employees?.name}</td>
              <td className="py-2 pr-4">{g.system_name}</td>
              <td className="py-2 pr-4 capitalize">{g.access_level}</td>
              <td className="py-2 pr-4">
                <span className={g.status === 'active' ? 'text-ink' : 'text-clay'}>{g.status}</span>
              </td>
              <td className="py-2 pr-4 text-muted">{g.granted_at?.slice(0, 10)}</td>
              {canRevoke && (
                <td className="py-2 pr-4">
                  {g.status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId === g.id}
                      onClick={() => handleRevoke(g.id)}
                      className="text-clay hover:underline disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {grants.length === 0 && (
            <tr>
              <td colSpan={canRevoke ? 6 : 5} className="py-4 text-muted">
                No access grants yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
