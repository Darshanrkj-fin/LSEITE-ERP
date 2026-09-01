import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

export function QuoteList() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [quotes, setQuotes] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let query = supabase
        .from('quotes')
        .select('id, quote_number, quote_date, status, grand_total, parties(name)')
        .order('quote_date', { ascending: false })
        .order('quote_number', { ascending: false })
      if (statusFilter) query = query.eq('status', statusFilter)
      const { data, error: fetchError } = await query
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setQuotes(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [statusFilter])

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Quotes</h1>
          <p className="text-sm text-slate-500">A quote has no accounting impact until it's converted to an invoice.</p>
        </div>
        {canEdit && (
          <Link
            to="/quotes/new"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New Quote
          </Link>
        )}
      </div>

      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-slate-600">Status</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="converted">Converted</option>
        </select>
      </label>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Quote #</th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Grand Total</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                <Link to={`/quotes/${q.id}`} className="text-slate-800 hover:underline">
                  {q.quote_number}
                </Link>
              </td>
              <td className="py-2 pr-4">{q.quote_date}</td>
              <td className="py-2 pr-4">{q.parties?.name}</td>
              <td className="py-2 pr-4 capitalize">{q.status}</td>
              <td className="py-2 pr-4">{q.grand_total}</td>
            </tr>
          ))}
          {quotes.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-slate-400">
                No quotes yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
