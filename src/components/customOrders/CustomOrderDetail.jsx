import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

export function CustomOrderDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [order, setOrder] = useState(null)
  const [advances, setAdvances] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [bankAccountId, setBankAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [advanceDate, setAdvanceDate] = useState(today())
  const [submitting, setSubmitting] = useState(false)
  const [refundingId, setRefundingId] = useState(null)

  const load = async () => {
    setLoading(true)
    const [{ data: o, error: orderError }, { data: advRows }, { data: accounts }] = await Promise.all([
      supabase.from('custom_orders').select('*, parties(name)').eq('id', id).single(),
      supabase.from('customer_advances').select('*').eq('custom_order_id', id).order('created_at', { ascending: false }),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'asset'),
    ])
    if (orderError) setError(orderError.message)
    else setOrder(o)
    setAdvances(advRows ?? [])
    setBankAccounts(accounts ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id])

  const handleRecordAdvance = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: postError } = await supabase.rpc('post_customer_advance', {
      p_custom_order_id: id,
      p_party_id: order.party_id,
      p_amount: parseFloat(amount),
      p_bank_account_id: bankAccountId,
      p_advance_date: advanceDate,
    })
    setSubmitting(false)
    if (postError) {
      setError(postError.message)
      return
    }
    setAmount('')
    setShowForm(false)
    load()
  }

  const handleRefund = async (advance) => {
    if (!window.confirm(`Refund advance of ${advance.amount}? This posts a reversing ledger entry dated today.`)) return
    setError(null)
    setRefundingId(advance.id)
    const { error: refundError } = await supabase.rpc('refund_customer_advance', { p_advance_id: advance.id })
    setRefundingId(null)
    if (refundError) {
      setError(refundError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>
  if (error && !order) return <p className="text-sm text-clay">{error}</p>

  return (
    <div className="max-w-3xl">
      <Link to="/custom-orders" className="mb-4 inline-block text-sm text-muted hover:underline">
        ← Back
      </Link>

      <h1 className="mb-1 text-xl font-semibold font-display text-ink">{order.parties?.name}</h1>
      <p className="mb-6 text-sm text-muted">
        {order.description || 'No description'} · {order.order_date} · <span className="capitalize">{order.status}</span>
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Advance Payments</h2>
          {canEdit && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              Record Advance Payment
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-muted">
          Optional. An advance is a liability until applied to the final invoice for this order — it never affects
          revenue on its own.
        </p>

        {showForm && (
          <form onSubmit={handleRecordAdvance} className="mb-4 flex flex-wrap items-end gap-3 rounded border border-slate-200 p-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Bank/cash account</span>
              <select
                required
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Amount</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Date</span>
              <input
                type="date"
                required
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Recording…' : 'Record'}
            </button>
          </form>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Status</th>
              {canEdit && <th className="py-2 pr-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {advances.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{a.advance_date}</td>
                <td className="py-2 pr-4">{a.amount}</td>
                <td className="py-2 pr-4 capitalize">{a.status}</td>
                {canEdit && (
                  <td className="py-2 pr-4">
                    {a.status === 'unapplied' && (
                      <button
                        onClick={() => handleRefund(a)}
                        disabled={refundingId === a.id}
                        className="text-sm text-clay hover:underline"
                      >
                        {refundingId === a.id ? 'Refunding…' : 'Refund'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {advances.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-muted">
                  No advances recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
