import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'section', label: 'Section' },
  { key: 'account_name', label: 'Account' },
  { key: 'amount', label: 'Amount' },
]

export function BalanceSheet() {
  const [asOf, setAsOf] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase.rpc('balance_sheet', { p_as_of: asOf })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [asOf])

  const assets = rows.filter((r) => r.section === 'asset')
  const liabilities = rows.filter((r) => r.section === 'liability')
  const equity = rows.filter((r) => r.section === 'equity')
  const totalAssets = assets.reduce((sum, r) => sum + r.amount, 0)
  const totalLiabilities = liabilities.reduce((sum, r) => sum + r.amount, 0)
  const totalEquity = equity.reduce((sum, r) => sum + r.amount, 0)
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.005

  const handleDownloadCsv = () => downloadCsv(`balance-sheet-${asOf}.csv`, COLUMNS, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({ filename: `balance-sheet-${asOf}.pdf`, title: 'Balance Sheet', subtitle: `As of ${asOf}`, columns: COLUMNS, rows })

  const Section = ({ title, items, total }) => (
    <>
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      <table className="mb-4 w-full text-sm">
        <tbody>
          {items.map((r) => (
            <tr key={r.account_name} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.account_name}</td>
              <td className="py-2 pr-4 text-right">{r.amount}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className="py-2 text-muted">None.</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-2 pr-4">Total {title}</td>
            <td className="py-2 pr-4 text-right">{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </>
  )

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Balance Sheet</h1>
      <p className="mb-6 text-sm text-muted">
        Assets, liabilities, and equity as of a date. "Current Earnings" folds in cumulative profit/loss to date,
        since there's no separate retained-earnings closing entry in this system.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">As of</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
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
          <Section title="Assets" items={assets} total={totalAssets} />
          <Section title="Liabilities" items={liabilities} total={totalLiabilities} />
          <Section title="Equity" items={equity} total={totalEquity} />

          <p className={`text-sm ${balanced ? 'text-green-600' : 'text-clay'}`}>
            {balanced
              ? '✓ Assets = Liabilities + Equity'
              : `✗ Not balanced (assets ${totalAssets.toFixed(2)} vs liabilities + equity ${(totalLiabilities + totalEquity).toFixed(2)}) — this should never happen, please report it.`}
          </p>
        </>
      )}
    </div>
  )
}
