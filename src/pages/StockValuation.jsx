import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function StockValuation() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase.rpc('stock_valuation')
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const total = rows.reduce((sum, r) => sum + Number(r.total_value), 0)

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Stock Valuation</h1>
      <p className="mb-6 text-sm text-muted">
        Current stock × cost, right now. Raw materials use the running average cost; finished goods are valued batch
        by batch since each may have been produced at a different cost.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Detail</th>
            <th className="py-2 pr-4">Quantity</th>
            <th className="py-2 pr-4">Unit cost</th>
            <th className="py-2 pr-4">Total value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.item_name}</td>
              <td className="py-2 pr-4 capitalize">{r.item_type?.replace('_', ' ')}</td>
              <td className="py-2 pr-4">{r.detail}</td>
              <td className="py-2 pr-4">{r.quantity}</td>
              <td className="py-2 pr-4">{r.unit_cost != null ? Number(r.unit_cost).toFixed(2) : '—'}</td>
              <td className="py-2 pr-4">{Number(r.total_value).toFixed(2)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted">
                Nothing in stock yet.
              </td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-2 pr-4" colSpan={5}>
              Total
            </td>
            <td className="py-2 pr-4">{total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
