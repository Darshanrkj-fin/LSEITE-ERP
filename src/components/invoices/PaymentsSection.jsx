import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const MODES = ['cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other']
const today = () => new Date().toISOString().slice(0, 10)

export function PaymentsSection({ invoice }) {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [payments, setPayments] = useState([])
  const [balance, setBalance] = useState(null)
  const [bankAccounts, setBankAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [bankAccountId, setBankAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today())
  const [mode, setMode] = useState(MODES[0])
  const [bankRef, setBankRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState(null)

  const load = async () => {
    setLoading(true)
    const [{ data: pays, error: payError }, { data: status }, { data: accounts }] = await Promise.all([
      supabase.from('payments').select('*').eq('invoice_id', invoice.id).order('created_at'),
      supabase.from('invoice_payment_status').select('amount_paid, balance_due').eq('invoice_id', invoice.id).maybeSingle(),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'asset'),
    ])
    if (payError) setError(payError.message)
    else setPayments(pays ?? [])
    setBalance(status ?? { amount_paid: 0, balance_due: invoice.grand_total })
    setBankAccounts(accounts ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, invoice.status])

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: postError } = await supabase.rpc('post_payment', {
      p_invoice_id: invoice.id,
      p_bank_account_id: bankAccountId,
      p_amount: parseFloat(amount),
      p_payment_date: paymentDate,
      p_mode: mode,
      p_bank_ref: bankRef || null,
    })
    setSubmitting(false)
    if (postError) {
      setError(postError.message)
      return
    }
    setAmount('')
    setBankRef('')
    load()
  }

  const handleCancelPayment = async (payment) => {
    if (!window.confirm(`Cancel this payment of ${payment.amount}? This posts a reversing ledger entry.`)) return
    setError(null)
    setCancellingId(payment.id)
    const { error: cancelError } = await supabase.rpc('cancel_payment', { p_payment_id: payment.id })
    setCancellingId(null)
    if (cancelError) {
      setError(cancelError.message)
      return
    }
    load()
  }

  if (loading) return null

  return (
    <div className="mt-8">
      <h2 className="mb-2 text-lg font-semibold text-ink">Payments</h2>
      <p className="mb-4 text-sm text-muted">
        Paid {balance?.amount_paid ?? 0} of {invoice.grand_total} — balance due {balance?.balance_due ?? invoice.grand_total}
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Amount</th>
            <th className="py-2 pr-4">Mode</th>
            <th className="py-2 pr-4">Bank ref</th>
            <th className="py-2 pr-4">Status</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{p.payment_date}</td>
              <td className="py-2 pr-4">{p.amount}</td>
              <td className="py-2 pr-4 capitalize">{p.mode.replace('_', ' ')}</td>
              <td className="py-2 pr-4">{p.bank_ref || '—'}</td>
              <td className="py-2 pr-4 capitalize">{p.status}</td>
              {canEdit && (
                <td className="py-2 pr-4">
                  {p.status === 'posted' && (
                    <button
                      onClick={() => handleCancelPayment(p)}
                      disabled={cancellingId === p.id}
                      className="text-sm text-clay hover:underline"
                    >
                      {cancellingId === p.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {payments.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted">
                No payments recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && invoice.status === 'posted' && balance?.balance_due > 0 && (
        <form onSubmit={handleRecordPayment} className="flex flex-wrap items-end gap-3">
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
              max={balance.balance_due}
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
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded border border-slate-300 px-3 py-2">
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Bank ref</span>
            <input
              type="text"
              placeholder="cheque/UTR no."
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Recording…' : 'Record Payment'}
          </button>
        </form>
      )}
    </div>
  )
}
