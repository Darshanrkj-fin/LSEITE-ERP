import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'account_type', label: 'Section' },
  { key: 'account_name', label: 'Account' },
  { key: 'net_amount', label: 'Amount' },
]

export function ProfitAndLoss() {
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
      const { data, error: fetchError } = await supabase.rpc('profit_and_loss', { p_from: from, p_to: to })
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

  const income = rows.filter((r) => r.account_type === 'income')
  const expense = rows.filter((r) => r.account_type === 'expense')
  const totalIncome = income.reduce((sum, r) => sum + r.net_amount, 0)
  const totalExpense = expense.reduce((sum, r) => sum + r.net_amount, 0)
  const netProfit = totalIncome - totalExpense

  const handleDownloadCsv = () => downloadCsv(`profit-and-loss-${from}-to-${to}.csv`, COLUMNS, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({
      filename: `profit-and-loss-${from}-to-${to}.pdf`,
      title: 'Profit & Loss',
      subtitle: `${from} to ${to}`,
      columns: COLUMNS,
      rows,
    })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Profit &amp; Loss</h1>
      <p className="mb-6 text-sm text-slate-500">Income and expenses posted within a period.</p>

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
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Income</h2>
          <table className="mb-4 w-full text-sm">
            <tbody>
              {income.map((r) => (
                <tr key={r.account_id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.account_name}</td>
                  <td className="py-2 pr-4 text-right">{r.net_amount}</td>
                </tr>
              ))}
              {income.length === 0 && (
                <tr>
                  <td className="py-2 text-slate-400">No income in this period.</td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-2 pr-4">Total Income</td>
                <td className="py-2 pr-4 text-right">{totalIncome.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-slate-700">Expenses</h2>
          <table className="mb-4 w-full text-sm">
            <tbody>
              {expense.map((r) => (
                <tr key={r.account_id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.account_name}</td>
                  <td className="py-2 pr-4 text-right">{r.net_amount}</td>
                </tr>
              ))}
              {expense.length === 0 && (
                <tr>
                  <td className="py-2 text-slate-400">No expenses in this period.</td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-2 pr-4">Total Expenses</td>
                <td className="py-2 pr-4 text-right">{totalExpense.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <p className={`text-base font-semibold ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            Net {netProfit >= 0 ? 'Profit' : 'Loss'}: {Math.abs(netProfit).toFixed(2)}
          </p>
        </>
      )}
    </div>
  )
}
