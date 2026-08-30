import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

export function ItemProfitability() {
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
      const { data, error: fetchError } = await supabase.rpc('item_profitability', { p_from: from, p_to: to })
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
    (acc, r) => ({ revenue: acc.revenue + r.revenue, cogs: acc.cogs + r.cogs, profit: acc.profit + r.profit }),
    { revenue: 0, cogs: 0, profit: 0 }
  )

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Item Profitability</h1>
      <p className="mb-6 text-sm text-slate-500">
        Revenue vs. cost of goods sold per finished-good item, for sales invoices posted within a period.
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
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Qty sold</th>
              <th className="py-2 pr-4">Revenue</th>
              <th className="py-2 pr-4">COGS</th>
              <th className="py-2 pr-4">Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.item_name}</td>
                <td className="py-2 pr-4">{r.quantity_sold}</td>
                <td className="py-2 pr-4">{Number(r.revenue).toFixed(2)}</td>
                <td className="py-2 pr-4">{Number(r.cogs).toFixed(2)}</td>
                <td className={`py-2 pr-4 font-medium ${r.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {Number(r.profit).toFixed(2)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-slate-400">
                  No finished-good items yet.
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4" colSpan={2}>
                Total
              </td>
              <td className="py-2 pr-4">{totals.revenue.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.cogs.toFixed(2)}</td>
              <td className={`py-2 pr-4 ${totals.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {totals.profit.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
