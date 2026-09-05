import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyPeriod = { period_start: '', period_end: '' }

// Matches the accounting_periods_write/update RLS policies: admin only.
// Closing a period blocks new postings dated inside it across every
// posting/reversal function (see reject_if_period_closed() in schema.sql) —
// there's no delete here on purpose, only open/closed toggling.
export function AccountingPeriods() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin'

  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newPeriod, setNewPeriod] = useState(emptyPeriod)
  const [adding, setAdding] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('accounting_periods')
      .select('*')
      .order('period_start', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setPeriods(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('accounting_periods').insert({
      company_id: profile.company_id,
      period_start: newPeriod.period_start,
      period_end: newPeriod.period_end,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewPeriod(emptyPeriod)
    load()
  }

  const toggleStatus = async (period) => {
    const nextStatus = period.status === 'open' ? 'closed' : 'open'
    if (
      !window.confirm(
        nextStatus === 'closed'
          ? `Close the period ${period.period_start} to ${period.period_end}? No invoices, payments, or advances can be posted or cancelled with a date in this range until it's reopened.`
          : `Reopen the period ${period.period_start} to ${period.period_end}?`
      )
    )
      return
    setError(null)
    setTogglingId(period.id)
    const { error: updateError } = await supabase
      .from('accounting_periods')
      .update({ status: nextStatus })
      .eq('id', period.id)
    setTogglingId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Accounting Periods</h1>
      <p className="mb-6 text-sm text-muted">
        Closing a period blocks any invoice, payment, or advance dated inside it from being posted or
        cancelled — for month-end/year-end close.
        {!canEdit && ' Only an admin can create or close/reopen a period.'}
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Start</th>
            <th className="py-2 pr-4">End</th>
            <th className="py-2 pr-4">Status</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{period.period_start}</td>
              <td className="py-2 pr-4">{period.period_end}</td>
              <td className="py-2 pr-4 capitalize">{period.status}</td>
              {canEdit && (
                <td className="py-2 pr-4">
                  <button
                    onClick={() => toggleStatus(period)}
                    disabled={togglingId === period.id}
                    className="text-sm text-ink hover:underline"
                  >
                    {period.status === 'open' ? 'Close' : 'Reopen'}
                  </button>
                </td>
              )}
            </tr>
          ))}
          {periods.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-muted">
                No accounting periods yet — every date is open until one is created and closed.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Start</span>
            <input
              type="date"
              required
              value={newPeriod.period_start}
              onChange={(e) => setNewPeriod((f) => ({ ...f, period_start: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">End</span>
            <input
              type="date"
              required
              value={newPeriod.period_end}
              onChange={(e) => setNewPeriod((f) => ({ ...f, period_end: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add period'}
          </button>
        </form>
      )}
    </div>
  )
}
