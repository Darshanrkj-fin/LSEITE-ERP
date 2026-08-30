import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function BatchExpiryReport() {
  const [rows, setRows] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('item_batch_status')
        .select('*')
        .order('expiry_date', { ascending: true, nullsFirst: false })
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

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort()
  const visibleRows = categoryFilter ? rows.filter((r) => r.category === categoryFilter) : rows

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Batch / Expiry Report</h1>
      <p className="mb-6 text-sm text-slate-500">
        Every batch with stock remaining, soonest expiry first — raw materials and finished goods alike.
      </p>

      <div className="mb-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Category</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Expiry date</th>
            <th className="py-2 pr-4">Remaining quantity</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.batch_id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.item_name}</td>
              <td className="py-2 pr-4 capitalize">{r.item_type?.replace('_', ' ')}</td>
              <td className="py-2 pr-4">{r.category || '—'}</td>
              <td className="py-2 pr-4">{r.expiry_date || '—'}</td>
              <td className="py-2 pr-4">{r.remaining_quantity}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-slate-400">
                No batches with remaining stock.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
