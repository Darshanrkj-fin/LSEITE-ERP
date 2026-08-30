import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const MAX_SUGGESTION_DAYS = 30

function daysBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 86400000
}

// Suggests the closest unmatched payment for a transaction, by amount
// first (weighted heavily — an exact-amount match a week apart should
// always outrank a same-day match with a very different amount) and date
// proximity second. Never used to auto-match anything — just to pre-select
// a starting guess that a person still has to confirm.
function suggestPayment(txn, payments) {
  let best = null
  let bestScore = Infinity
  for (const p of payments) {
    const dayGap = daysBetween(p.payment_date, txn.transaction_date)
    if (dayGap > MAX_SUGGESTION_DAYS) continue
    const amountGap = Math.abs(Number(p.amount) - Number(txn.amount))
    const score = amountGap * 1000 + dayGap
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

export function Reconciliation() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [unmatchedTxns, setUnmatchedTxns] = useState([])
  const [unmatchedPayments, setUnmatchedPayments] = useState([])
  const [matched, setMatched] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedTxnId, setSelectedTxnId] = useState(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState(null)
  const [working, setWorking] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: allTxns, error: txnError }, { data: allPayments, error: paymentError }] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase
        .from('payments')
        .select('*, invoices(invoice_number, type, parties(name))')
        .eq('status', 'posted')
        .order('payment_date', { ascending: false }),
    ])
    if (txnError) setError(txnError.message)
    if (paymentError) setError(paymentError.message)

    const txns = allTxns ?? []
    const payments = allPayments ?? []
    const matchedPaymentIds = new Set(txns.filter((t) => t.matched_payment_id).map((t) => t.matched_payment_id))

    setUnmatchedTxns(txns.filter((t) => !t.matched_payment_id))
    setUnmatchedPayments(payments.filter((p) => !matchedPaymentIds.has(p.id)))
    setMatched(
      txns
        .filter((t) => t.matched_payment_id)
        .map((t) => ({ txn: t, payment: payments.find((p) => p.id === t.matched_payment_id) }))
    )
    setSelectedTxnId(null)
    setSelectedPaymentId(null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleMatch = async () => {
    setError(null)
    setWorking(true)
    const { error: matchError } = await supabase
      .from('bank_transactions')
      .update({ matched_payment_id: selectedPaymentId })
      .eq('id', selectedTxnId)
    setWorking(false)
    if (matchError) {
      setError(matchError.message)
      return
    }
    load()
  }

  const handleUnmatch = async (txnId) => {
    setError(null)
    const { error: unmatchError } = await supabase
      .from('bank_transactions')
      .update({ matched_payment_id: null })
      .eq('id', txnId)
    if (unmatchError) {
      setError(unmatchError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Reconciliation</h1>
      <p className="mb-6 text-sm text-slate-500">
        Match a bank transaction to the payment it corresponds to. Selecting a transaction pre-selects its closest
        likely payment by amount and date — review it (or pick a different one) before confirming. Nothing is
        matched automatically.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {canEdit && (
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Unmatched bank transactions</h2>
            <div className="max-h-72 overflow-auto rounded border border-slate-200">
              {unmatchedTxns.map((t) => {
                const suggestion = suggestPayment(t, unmatchedPayments)
                return (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="radio"
                      name="txn"
                      className="mt-1"
                      checked={selectedTxnId === t.id}
                      onChange={() => {
                        setSelectedTxnId(t.id)
                        setSelectedPaymentId(suggestion?.id ?? null)
                      }}
                    />
                    <span>
                      <span className="block">
                        {t.transaction_date} — {t.amount} {t.description && `(${t.description})`}
                      </span>
                      {suggestion && (
                        <span className="block text-xs text-slate-400">
                          Suggested: {suggestion.invoices?.invoice_number} · {suggestion.amount} · {suggestion.payment_date}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
              {unmatchedTxns.length === 0 && <p className="p-3 text-sm text-slate-400">None.</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Unmatched payments</h2>
            <div className="max-h-72 overflow-auto rounded border border-slate-200">
              {unmatchedPayments.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                  <input
                    type="radio"
                    name="payment"
                    checked={selectedPaymentId === p.id}
                    onChange={() => setSelectedPaymentId(p.id)}
                  />
                  <span>
                    {p.payment_date} — {p.amount} ({p.invoices?.invoice_number}, {p.invoices?.parties?.name})
                  </span>
                </label>
              ))}
              {unmatchedPayments.length === 0 && <p className="p-3 text-sm text-slate-400">None.</p>}
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <button
          onClick={handleMatch}
          disabled={!selectedTxnId || !selectedPaymentId || working}
          className="mb-8 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {working ? 'Matching…' : 'Match Selected'}
        </button>
      )}

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Matched</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Bank transaction</th>
            <th className="py-2 pr-4">Payment</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {matched.map(({ txn, payment }) => (
            <tr key={txn.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                {txn.transaction_date} — {txn.amount}
              </td>
              <td className="py-2 pr-4">
                {payment ? `${payment.payment_date} — ${payment.amount} (${payment.invoices?.invoice_number})` : '—'}
              </td>
              {canEdit && (
                <td className="py-2 pr-4">
                  <button onClick={() => handleUnmatch(txn.id)} className="text-sm text-red-600 hover:underline">
                    Unmatch
                  </button>
                </td>
              )}
            </tr>
          ))}
          {matched.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-slate-400">
                No matches yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
