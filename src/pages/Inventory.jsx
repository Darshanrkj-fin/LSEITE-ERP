import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function Inventory() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('item_current_stock')
        .select('*')
        .order('name')
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

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Inventory</h1>
      <p className="mb-6 text-sm text-muted">
        Current stock per item, updated automatically as sales and purchase invoices post. Set the low-stock alert
        threshold on the Item Master screen.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">HSN/SAC</th>
            <th className="py-2 pr-4">Unit</th>
            <th className="py-2 pr-4">Current stock</th>
            <th className="py-2 pr-4">Low-stock alert</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isLow = row.low_stock_threshold != null && row.current_stock <= row.low_stock_threshold
            return (
              <tr key={row.item_id} className={`border-b border-slate-100 ${isLow ? 'bg-red-50' : ''}`}>
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4">{row.hsn_sac_code}</td>
                <td className="py-2 pr-4">{row.unit}</td>
                <td className={`py-2 pr-4 ${isLow ? 'font-semibold text-clay' : ''}`}>
                  {row.current_stock}
                  {isLow && ' — Low stock'}
                </td>
                <td className="py-2 pr-4">{row.low_stock_threshold ?? '—'}</td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted">
                No stock-tracked items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
