import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

export function SubscriptionCycleList({ basePath }) {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('subscription_cycles')
        .select('id, cycle_date, status, invoice_id, subscriptions(parties(name))')
        .order('cycle_date', { ascending: false })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setCycles(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold font-display text-ink">Subscription Cycles</h1>
          <p className="text-sm text-muted">
            One row per billing cycle. Draft cycles are created here ahead of time (or automatically once due) and
            reviewed before finalizing into a real invoice.
          </p>
        </div>
        {canEdit && (
          <Link
            to={`${basePath}/new`}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            New Cycle
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Cycle date</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                <Link to={`${basePath}/${c.id}`} className="text-ink hover:underline">
                  {c.subscriptions?.parties?.name}
                </Link>
              </td>
              <td className="py-2 pr-4">{c.cycle_date}</td>
              <td className="py-2 pr-4 capitalize">{c.status}</td>
            </tr>
          ))}
          {cycles.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-muted">
                No subscription cycles yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
