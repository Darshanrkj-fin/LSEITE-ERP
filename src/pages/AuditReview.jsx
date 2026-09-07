import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const REFERENCE_TYPES = [
  { value: 'period', label: 'Period (date range, not one record)' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Payment' },
  { value: 'expense_claim', label: 'Expense claim' },
  { value: 'wastage', label: 'Wastage' },
  { value: 'production_entry', label: 'Production entry' },
  { value: 'payroll_run', label: 'Payroll run' },
  { value: 'bank_reconciliation', label: 'Bank reconciliation' },
  { value: 'gst_return', label: 'GST return' },
  { value: 'tds_return', label: 'TDS return' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'credit_debit_note', label: 'Credit/debit note' },
  { value: 'fixed_asset', label: 'Fixed asset' },
]

export function AuditReview() {
  const { profile } = useAuth()
  const [flags, setFlags] = useState([])
  const [findingsByFlag, setFindingsByFlag] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [referenceType, setReferenceType] = useState(REFERENCE_TYPES[0].value)
  const [referenceId, setReferenceId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [reason, setReason] = useState('')
  const [flagging, setFlagging] = useState(false)
  const [flagError, setFlagError] = useState(null)

  const [findingText, setFindingText] = useState({})
  const [resolutionNote, setResolutionNote] = useState({})
  const [busyId, setBusyId] = useState(null)

  const canFlag = profile?.is_admin || profile?.app_roles?.includes('accountant') || profile?.app_roles?.includes('ca_auditor')
  const canReview = profile?.is_admin || profile?.app_roles?.includes('ca_auditor')

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data: flagRows, error: fetchError } = await supabase
      .from('audit_flags')
      .select('*, flagged_by:users!flagged_by(full_name), resolved_by:users!resolved_by(full_name)')
      .order('created_at', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setFlags(flagRows ?? [])

    if (flagRows?.length) {
      const { data: findingRows } = await supabase
        .from('audit_findings')
        .select('*, recorded_by:users(full_name)')
        .in('audit_flag_id', flagRows.map((f) => f.id))
        .order('created_at')
      const grouped = {}
      for (const f of findingRows ?? []) {
        grouped[f.audit_flag_id] = [...(grouped[f.audit_flag_id] ?? []), f]
      }
      setFindingsByFlag(grouped)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitFlag = async (e) => {
    e.preventDefault()
    setFlagging(true)
    setFlagError(null)
    const { error: rpcError } = await supabase.rpc('flag_for_audit', {
      p_reference_type: referenceType,
      p_reference_id: referenceType === 'period' ? null : referenceId,
      p_period_start: referenceType === 'period' ? periodStart : null,
      p_period_end: referenceType === 'period' ? periodEnd : null,
      p_reason: reason,
    })
    setFlagging(false)
    if (rpcError) {
      setFlagError(rpcError.message)
      return
    }
    setReferenceId('')
    setPeriodStart('')
    setPeriodEnd('')
    setReason('')
    load()
  }

  const addFinding = async (flagId) => {
    setBusyId(flagId)
    const { error: rpcError } = await supabase.rpc('add_audit_finding', {
      p_audit_flag_id: flagId,
      p_finding: findingText[flagId] || '',
    })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setFindingText((t) => ({ ...t, [flagId]: '' }))
    load()
  }

  const resolveFlag = async (flagId) => {
    setBusyId(flagId)
    const { error: rpcError } = await supabase.rpc('resolve_audit_flag', {
      p_audit_flag_id: flagId,
      p_resolution_note: resolutionNote[flagId] || '',
    })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  const open = flags.filter((f) => f.status === 'open')
  const resolved = flags.filter((f) => f.status === 'resolved')

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Audit Review</h1>
      <p className="mb-6 text-sm text-muted">
        A CA's (or an accountant's) review trail alongside the ledger — flag a specific record or a whole
        period, record findings as the review proceeds, and sign off when satisfied. Flagging something
        here never blocks or reverses it; this is a review note, not an approval gate. For a specific
        record, copy its ID from its detail page or the browser URL.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {canFlag && (
        <form onSubmit={submitFlag} className="mb-8 rounded border border-line p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Flag something for review</h2>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">What to flag</span>
              <select
                value={referenceType}
                onChange={(e) => setReferenceType(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              >
                {REFERENCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {referenceType === 'period' ? (
              <div className="flex gap-2">
                <label className="flex-1 text-sm">
                  <span className="mb-1 block text-muted">From</span>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="flex-1 text-sm">
                  <span className="mb-1 block text-muted">To</span>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            ) : (
              <label className="text-sm">
                <span className="mb-1 block text-muted">Record ID</span>
                <input
                  type="text"
                  required
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  placeholder="paste the record's UUID"
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            )}
          </div>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-muted">Reason</span>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {flagError && <p className="mb-3 text-sm text-clay">{flagError}</p>}
          <button
            type="submit"
            disabled={flagging}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {flagging ? 'Flagging…' : 'Flag for review'}
          </button>
        </form>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink">Open ({open.length})</h2>
      {open.length === 0 ? (
        <p className="mb-6 text-sm text-muted">Nothing open.</p>
      ) : (
        <ul className="mb-6 space-y-4">
          {open.map((f) => (
            <li key={f.id} className="rounded border border-line p-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-ink">
                  {REFERENCE_TYPES.find((t) => t.value === f.reference_type)?.label ?? f.reference_type}
                </span>
                <span className="text-muted">
                  {f.reference_type === 'period' ? `${f.period_start} to ${f.period_end}` : f.reference_id}
                </span>
              </div>
              <p className="mb-2 text-sm text-muted">
                Flagged by {f.flagged_by?.full_name ?? '—'}: {f.reason}
              </p>
              {(findingsByFlag[f.id] ?? []).length > 0 && (
                <ul className="mb-2 space-y-1 border-l-2 border-slate-200 pl-3 text-sm text-muted">
                  {findingsByFlag[f.id].map((fnd) => (
                    <li key={fnd.id}>
                      {fnd.recorded_by?.full_name ?? '—'}: {fnd.finding}
                    </li>
                  ))}
                </ul>
              )}
              {canReview && (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <input
                      type="text"
                      placeholder="Add a finding"
                      value={findingText[f.id] ?? ''}
                      onChange={(e) => setFindingText((t) => ({ ...t, [f.id]: e.target.value }))}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busyId === f.id || !(findingText[f.id] ?? '').trim()}
                      onClick={() => addFinding(f.id)}
                      className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Add finding
                    </button>
                  </div>
                  <div className="flex items-end gap-2">
                    <input
                      type="text"
                      placeholder="Resolution note (required to sign off)"
                      value={resolutionNote[f.id] ?? ''}
                      onChange={(e) => setResolutionNote((t) => ({ ...t, [f.id]: e.target.value }))}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busyId === f.id || !(resolutionNote[f.id] ?? '').trim()}
                      onClick={() => resolveFlag(f.id)}
                      className="rounded bg-ink px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Sign off
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink">Resolved</h2>
      {resolved.length === 0 ? (
        <p className="text-sm text-muted">Nothing resolved yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {resolved.map((f) => (
            <li key={f.id} className="border-b border-slate-100 py-2">
              <div className="flex justify-between">
                <span>
                  {REFERENCE_TYPES.find((t) => t.value === f.reference_type)?.label ?? f.reference_type} ·{' '}
                  {f.flagged_by?.full_name ?? '—'}
                </span>
                <span className="text-ink">resolved by {f.resolved_by?.full_name ?? '—'}</span>
              </div>
              {f.resolution_note && <p className="text-muted">{f.resolution_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
