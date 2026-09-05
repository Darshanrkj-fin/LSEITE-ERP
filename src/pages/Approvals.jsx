import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const ENTITY_LABELS = {
  fixed_asset_capitalization: 'Fixed asset capitalization',
  payroll_run: 'Payroll run',
  purchase_invoice: 'Purchase invoice',
  wastage: 'Wastage',
  project_invoice: 'Project invoice',
  expense_claim: 'Expense claim',
  access_request: 'Access request',
}

export function Approvals() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [myRoles, setMyRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [comment, setComment] = useState({})

  const load = async () => {
    setLoading(true)
    const [{ data: reqRows, error: fetchError }, { data: roleRows }] = await Promise.all([
      supabase
        .from('approval_requests')
        .select('*, requested_by:users(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('user_app_roles').select('app_role').eq('user_id', profile.id),
    ])
    if (fetchError) setError(fetchError.message)
    else setRequests(reqRows ?? [])
    setMyRoles((roleRows ?? []).map((r) => r.app_role))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requiredRoleFor = (req) => (req.status === 'pending' ? req.approval_chain[req.current_step] : null)
  const canActOn = (req) => {
    const role = requiredRoleFor(req)
    return role && myRoles.includes(role)
  }

  const act = async (req, action) => {
    setError(null)
    setBusyId(req.id)
    const { error: rpcError } = await supabase.rpc(action === 'approve' ? 'approve_request' : 'reject_request', {
      p_request_id: req.id,
      p_comment: comment[req.id] || null,
    })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  const pending = requests.filter((r) => r.status === 'pending')
  const resolved = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Approvals</h1>
      <p className="mb-6 text-sm text-muted">
        Requests below the configured threshold for their module post immediately and never appear here (see
        Roles &amp; Permissions to set thresholds). Only requests waiting on a step you hold the role for can be
        acted on.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <h2 className="mb-2 text-sm font-semibold text-ink">Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="mb-6 text-sm text-muted">Nothing pending.</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {pending.map((r) => {
            const requiredRole = requiredRoleFor(r)
            const canAct = canActOn(r)
            return (
              <li key={r.id} className="rounded border border-line p-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{ENTITY_LABELS[r.entity_type] ?? r.entity_type}</span>
                  <span className="text-muted">{r.amount}</span>
                </div>
                <p className="mb-2 text-sm text-muted">
                  Requested by {r.requested_by?.full_name ?? '—'} · step {r.current_step + 1}/{r.approval_chain.length}
                  {requiredRole && <> · waiting on <span className="font-medium">{requiredRole}</span></>}
                </p>
                {canAct ? (
                  <div className="flex items-end gap-2">
                    <input
                      type="text"
                      placeholder="Comment (optional)"
                      value={comment[r.id] ?? ''}
                      onChange={(e) => setComment((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => act(r, 'approve')}
                      className="rounded bg-ink px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => act(r, 'reject')}
                      className="rounded border border-slate-300 px-3 py-1 text-sm text-clay hover:bg-slate-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Waiting on someone holding the {requiredRole} role.</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink">Resolved</h2>
      {resolved.length === 0 ? (
        <p className="text-sm text-muted">Nothing resolved yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {resolved.map((r) => (
            <li key={r.id} className="flex justify-between border-b border-slate-100 py-1">
              <span>
                {ENTITY_LABELS[r.entity_type] ?? r.entity_type} · {r.requested_by?.full_name ?? '—'}
              </span>
              <span className={r.status === 'approved' ? 'text-ink' : 'text-clay'}>{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
