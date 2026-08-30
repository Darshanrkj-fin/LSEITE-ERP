import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'account_name', label: 'Account' },
  { key: 'opening_balance', label: 'Opening' },
  { key: 'net_movement', label: 'Net movement' },
  { key: 'closing_balance', label: 'Closing' },
]

export function CashFlow() {
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
      const { data, error: fetchError } = await supabase.rpc('cash_flow_summary', { p_from: from, p_to: to })
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

  const totals = rows.reduce(
    (acc, r) => ({
      opening: acc.opening + Number(r.opening_balance),
      movement: acc.movement + Number(r.net_movement),
      closing: acc.closing + Number(r.closing_balance),
    }),
    { opening: 0, movement: 0, closing: 0 }
  )

  const handleDownloadCsv = () => downloadCsv(`cash-flow-${from}-to-${to}.csv`, COLUMNS, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({ filename: `cash-flow-${from}-to-${to}.pdf`, title: 'Cash Flow', subtitle: `${from} to ${to}`, columns: COLUMNS, rows })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Cash Flow</h1>
      <p className="mb-6 text-sm text-slate-500">
        Opening, net movement, and closing balance per bank/cash account over a period ("bank/cash account" here
        means any asset account you set up yourself — the system-tagged ones like Accounts Receivable and Inventory
        are excluded).
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">To</span>
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

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">Account</th>
              <th className="py-2 pr-4">Opening</th>
              <th className="py-2 pr-4">Net movement</th>
              <th className="py-2 pr-4">Closing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account_name} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.account_name}</td>
                <td className="py-2 pr-4">{Number(r.opening_balance).toFixed(2)}</td>
                <td className={`py-2 pr-4 ${r.net_movement >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {Number(r.net_movement).toFixed(2)}
                </td>
                <td className="py-2 pr-4">{Number(r.closing_balance).toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-slate-400">
                  No bank/cash accounts set up yet.
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4">Total</td>
              <td className="py-2 pr-4">{totals.opening.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.movement.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.closing.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
