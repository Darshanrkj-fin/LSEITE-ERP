import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const today = () => new Date().toISOString().slice(0, 10)
const startOfMonth = () => today().slice(0, 8) + '01'

export function Dashboard() {
  const [salesThisMonth, setSalesThisMonth] = useState(null)
  const [lowStockItems, setLowStockItems] = useState([])
  const [cyclesAwaitingReview, setCyclesAwaitingReview] = useState([])
  const [expiringBatches, setExpiringBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: invoices, error: invError }, { data: stock }, { data: cycles }, { data: batches }] = await Promise.all([
        supabase
          .from('invoices')
          .select('grand_total')
          .eq('type', 'sales')
          .eq('status', 'posted')
          .gte('invoice_date', startOfMonth())
          .lte('invoice_date', today()),
        supabase.from('item_current_stock').select('*'),
        supabase
          .from('subscription_cycles')
          .select('id, cycle_date, subscriptions(parties(name))')
          .eq('status', 'draft')
          .order('cycle_date'),
        supabase
          .from('item_batch_status')
          .select('*')
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .limit(5),
      ])
      if (cancelled) return
      if (invError) setError(invError.message)
      setSalesThisMonth((invoices ?? []).reduce((sum, r) => sum + Number(r.grand_total), 0))
      setLowStockItems((stock ?? []).filter((r) => r.low_stock_threshold != null && r.current_stock <= r.low_stock_threshold))
      setCyclesAwaitingReview(cycles ?? [])
      setExpiringBatches(batches ?? [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="font-display mb-6 text-xl font-semibold text-ink">Dashboard</h1>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded border border-line bg-mist p-4">
          <p className="text-sm text-muted">Sales this month</p>
          <p className="text-2xl font-semibold text-ink">{salesThisMonth.toFixed(2)}</p>
        </div>
        <div className="rounded border border-line bg-mist p-4">
          <p className="text-sm text-muted">Low-stock items</p>
          <p className={`text-2xl font-semibold ${lowStockItems.length > 0 ? 'text-clay' : 'text-ink'}`}>
            {lowStockItems.length}
          </p>
        </div>
        <div className="rounded border border-line bg-mist p-4">
          <p className="text-sm text-muted">Subscription cycles awaiting review</p>
          <p className={`text-2xl font-semibold ${cyclesAwaitingReview.length > 0 ? 'text-gold' : 'text-ink'}`}>
            {cyclesAwaitingReview.length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Low-stock items</h2>
          {lowStockItems.length === 0 ? (
            <p className="text-sm text-muted">Nothing below threshold.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lowStockItems.map((r) => (
                <li key={r.item_id} className="flex justify-between border-b border-line py-1">
                  <span>{r.name}</span>
                  <span className="text-clay">
                    {r.current_stock} / {r.low_stock_threshold}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/inventory" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
            View inventory →
          </Link>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Subscription cycles awaiting review</h2>
          {cyclesAwaitingReview.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {cyclesAwaitingReview.map((c) => (
                <li key={c.id} className="flex justify-between border-b border-line py-1">
                  <span>{c.subscriptions?.parties?.name}</span>
                  <span className="text-muted">{c.cycle_date}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/subscription-cycles" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
            View subscription cycles →
          </Link>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Batches nearest expiry</h2>
          {expiringBatches.length === 0 ? (
            <p className="text-sm text-muted">No batches tracked yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {expiringBatches.map((b) => (
                <li key={b.batch_id} className="flex justify-between border-b border-line py-1">
                  <span>{b.item_name}</span>
                  <span className="text-muted">
                    {b.expiry_date ?? 'no expiry'} · {b.remaining_quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/batch-expiry-report" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
            View full batch/expiry report →
          </Link>
        </div>
      </div>
    </div>
  )
}
