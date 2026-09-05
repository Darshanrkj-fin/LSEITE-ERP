import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

export function DepreciationRuns() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [runDate, setRunDate] = useState(today())
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('depreciation_runs')
      .select('*')
      .order('period_start', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setRuns(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleRun = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('post_depreciation_run', { p_run_date: runDate })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (Number(data.total_depreciation) === 0) {
      setError('Run completed, but nothing was depreciated this period (no active, undepreciated assets in range).')
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Depreciation Runs</h1>
      <p className="mb-6 text-sm text-muted">
        Posts one month of straight-line depreciation for every active asset purchased on or before that
        month, capped at cost minus salvage value. One run per calendar month.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Period</th>
            <th className="py-2 pr-4">Run date</th>
            <th className="py-2 pr-4">Total depreciation</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                {r.period_start} to {r.period_end}
              </td>
              <td className="py-2 pr-4">{r.run_date}</td>
              <td className="py-2 pr-4">{r.total_depreciation}</td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-muted">
                No depreciation runs posted yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleRun} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Any date within the month to run</span>
            <input type="date" required value={runDate} onChange={(e) => setRunDate(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Run Depreciation'}
          </button>
        </form>
      )}
    </div>
  )
}
