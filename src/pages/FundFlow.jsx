import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'classification', label: 'Classification' },
  { key: 'account_name', label: 'Account' },
  { key: 'change', label: 'Amount' },
]

export function FundFlow() {
  const [from, setFrom] = useState(thisFinancialYearRange().from)
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase.rpc('fund_flow_summary', { p_from: from, p_to: to })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [from, to])

  const sources = rows.filter((r) => r.classification === 'source')
  const applications = rows.filter((r) => r.classification === 'application')
  const totalSources = sources.reduce((sum, r) => sum + Math.abs(Number(r.change)), 0)
  const totalApplications = applications.reduce((sum, r) => sum + Math.abs(Number(r.change)), 0)

  const handleDownloadCsv = () => downloadCsv(`fund-flow-${from}-to-${to}.csv`, COLUMNS, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({ filename: `fund-flow-${from}-to-${to}.pdf`, title: 'Fund Flow', subtitle: `${from} to ${to}`, columns: COLUMNS, rows })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Fund Flow</h1>
      <p className="mb-6 text-sm text-muted">
        How balance-sheet accounts changed between two dates — a rise in assets or a fall in liabilities/equity is an
        application of funds; the reverse is a source. Scoped to balance-sheet changes only, not a full
        adjusted-for-non-cash-items statement.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <button
          type="button"
          onClick={() => { const r = thisFinancialYearRange(); setFrom(r.from); setTo(r.to) }}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          This FY
        </button>
        <button
          type="button"
          onClick={() => { const r = lastFinancialYearRange(); setFrom(r.from); setTo(r.to) }}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Last FY
        </button>
        <button onClick={handleDownloadCsv} disabled={rows.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download CSV
        </button>
        <button onClick={handleDownloadPdf} disabled={rows.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download PDF
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-ink">Sources of funds</h2>
          <table className="mb-4 w-full text-sm">
            <tbody>
              {sources.map((r) => (
                <tr key={`${r.section}-${r.account_name}`} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.account_name}</td>
                  <td className="py-2 pr-4 text-right">{Math.abs(Number(r.change)).toFixed(2)}</td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td className="py-2 text-muted">None in this period.</td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-2 pr-4">Total Sources</td>
                <td className="py-2 pr-4 text-right">{totalSources.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-ink">Application of funds</h2>
          <table className="mb-4 w-full text-sm">
            <tbody>
              {applications.map((r) => (
                <tr key={`${r.section}-${r.account_name}`} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.account_name}</td>
                  <td className="py-2 pr-4 text-right">{Math.abs(Number(r.change)).toFixed(2)}</td>
                </tr>
              ))}
              {applications.length === 0 && (
                <tr>
                  <td className="py-2 text-muted">None in this period.</td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-2 pr-4">Total Application</td>
                <td className="py-2 pr-4 text-right">{totalApplications.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <p className={`text-sm font-semibold ${totalSources === totalApplications ? 'text-green-700' : 'text-gold'}`}>
            {totalSources === totalApplications
              ? '✓ Sources = Application'
              : `Difference: ${(totalSources - totalApplications).toFixed(2)} (expected — see note above on scope)`}
          </p>
        </>
      )}
    </div>
  )
}
