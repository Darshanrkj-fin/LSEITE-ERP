import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const MAX_SUGGESTION_DAYS = 30
const today = () => new Date().toISOString().slice(0, 10)

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
  const canEdit = profile?.is_admin || profile?.app_roles?.includes('accountant')

  const [bankAccounts, setBankAccounts] = useState([])
  const [reconciliations, setReconciliations] = useState([])
  const [activeId, setActiveId] = useState(null)

  const [allTxns, setAllTxns] = useState([])
  const [allPayments, setAllPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const [selectedTxnId, setSelectedTxnId] = useState(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState(null)
  const [working, setWorking] = useState(false)

  const [newBankAccountId, setNewBankAccountId] = useState('')
  const [newPeriodStart, setNewPeriodStart] = useState(today())
  const [newPeriodEnd, setNewPeriodEnd] = useState(today())
  const [newOpeningBalance, setNewOpeningBalance] = useState('')
  const [newClosingBalance, setNewClosingBalance] = useState('')
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: accounts }, { data: recons, error: reconError }, { data: txns, error: txnError }, { data: payments, error: paymentError }] =
      await Promise.all([
        supabase.from('bank_accounts').select('id, account_name, bank_name'),
        supabase.from('bank_reconciliations').select('*, bank_accounts(account_name)').order('created_at', { ascending: false }),
        supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }),
        supabase
          .from('payments')
          .select('*, invoices(invoice_number, type, parties(name))')
          .eq('status', 'posted')
          .order('payment_date', { ascending: false }),
      ])
    setBankAccounts(accounts ?? [])
    if (reconError) setError(reconError.message)
    else setReconciliations(recons ?? [])
    if (txnError) setError(txnError.message)
    else setAllTxns(txns ?? [])
    if (paymentError) setError(paymentError.message)
    else setAllPayments(payments ?? [])
    setSelectedTxnId(null)
    setSelectedPaymentId(null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const active = reconciliations.find((r) => r.id === activeId) ?? null

  // Scoped to the active draft period's bank account + date range — every
  // other reconciliation (pending/approved/rejected, or a different period)
  // is left completely alone.
  const scopedTxns = active
    ? allTxns.filter(
        (t) => t.bank_account_id === active.bank_account_id && t.transaction_date >= active.period_start && t.transaction_date <= active.period_end
      )
    : []
  const unmatchedTxns = scopedTxns.filter((t) => !t.matched_payment_id)
  const matchedPaymentIds = new Set(scopedTxns.filter((t) => t.matched_payment_id).map((t) => t.matched_payment_id))
  const unmatchedPayments = allPayments.filter((p) => !matchedPaymentIds.has(p.id))
  const matched = scopedTxns.filter((t) => t.matched_payment_id).map((t) => ({ txn: t, payment: allPayments.find((p) => p.id === t.matched_payment_id) }))

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setCreating(true)
    const { data: recon, error: createError } = await supabase.rpc('create_bank_reconciliation', {
      p_bank_account_id: newBankAccountId,
      p_period_start: newPeriodStart,
      p_period_end: newPeriodEnd,
      p_opening_balance: parseFloat(newOpeningBalance) || 0,
      p_closing_balance: parseFloat(newClosingBalance) || 0,
    })
    setCreating(false)
    if (createError) {
      setError(createError.message)
      return
    }
    setNewBankAccountId('')
    setNewOpeningBalance('')
    setNewClosingBalance('')
    await load()
    setActiveId(recon.id)
  }

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

  const handleSubmit = async () => {
    if (!window.confirm('Submit this reconciliation for approval? Its matched transactions will be locked from further changes while under review.')) return
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { data: request, error: submitError } = await supabase.rpc('submit_bank_reconciliation', {
      p_reconciliation_id: activeId,
    })
    setSubmitting(false)
    if (submitError) {
      setError(submitError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    } else {
      setInfo('Reconciliation approved immediately.')
    }
    setActiveId(null)
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Reconciliation</h1>
      <p className="mb-6 text-sm text-muted">
        Open a period for a bank account and statement date range, match its transactions to payments, then
        submit it for approval. Nothing is matched automatically, and a submitted or approved period's
        transactions are locked from further changes.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      <h2 className="mb-2 text-sm font-semibold text-ink">Reconciliation periods</h2>
      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Bank account</th>
            <th className="py-2 pr-4">Period</th>
            <th className="py-2 pr-4">Opening</th>
            <th className="py-2 pr-4">Closing</th>
            <th className="py-2 pr-4">Reconciled</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {reconciliations.map((r) => (
            <tr key={r.id} className={`border-b border-slate-100 ${activeId === r.id ? 'bg-mist' : ''}`}>
              <td className="py-2 pr-4">{r.bank_accounts?.account_name}</td>
              <td className="py-2 pr-4">
                {r.period_start} – {r.period_end}
              </td>
              <td className="py-2 pr-4">{r.opening_balance}</td>
              <td className="py-2 pr-4">{r.closing_balance}</td>
              <td className="py-2 pr-4">{r.reconciled_total}</td>
              <td className="py-2 pr-4">
                <span className={r.status === 'draft' || r.status === 'approved' ? 'text-ink' : r.status === 'pending' ? 'text-muted' : 'text-clay'}>
                  {r.status}
                </span>
              </td>
              <td className="py-2 pr-4">
                {r.status === 'draft' && canEdit && (
                  <button onClick={() => setActiveId(r.id)} className="text-sm text-ink hover:underline">
                    {activeId === r.id ? 'Working on this' : 'Work on this'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {reconciliations.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-muted">
                No reconciliation periods yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3 rounded border border-line p-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Bank account</span>
            <select
              required
              value={newBankAccountId}
              onChange={(e) => setNewBankAccountId(e.target.value)}
              className="min-w-40 rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Period start</span>
            <input
              type="date"
              required
              value={newPeriodStart}
              onChange={(e) => setNewPeriodStart(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Period end</span>
            <input
              type="date"
              required
              value={newPeriodEnd}
              onChange={(e) => setNewPeriodEnd(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Opening balance</span>
            <input
              type="number"
              step="0.01"
              required
              value={newOpeningBalance}
              onChange={(e) => setNewOpeningBalance(e.target.value)}
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Closing balance</span>
            <input
              type="number"
              step="0.01"
              required
              value={newClosingBalance}
              onChange={(e) => setNewClosingBalance(e.target.value)}
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Opening…' : 'Open New Period'}
          </button>
        </form>
      )}

      {active && (
        <>
          <div className="mb-4 flex items-center justify-between rounded border border-line bg-mist p-3 text-sm">
            <span>
              Working on {active.bank_accounts?.account_name}, {active.period_start} – {active.period_end}
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-6">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Unmatched bank transactions</h2>
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
                          <span className="block text-xs text-muted">
                            Suggested: {suggestion.invoices?.invoice_number} · {suggestion.amount} · {suggestion.payment_date}
                          </span>
                        )}
                      </span>
                    </label>
                  )
                })}
                {unmatchedTxns.length === 0 && <p className="p-3 text-sm text-muted">None in this period.</p>}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Unmatched payments</h2>
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
                {unmatchedPayments.length === 0 && <p className="p-3 text-sm text-muted">None.</p>}
              </div>
            </div>
          </div>

          <button
            onClick={handleMatch}
            disabled={!selectedTxnId || !selectedPaymentId || working}
            className="mb-8 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {working ? 'Matching…' : 'Match Selected'}
          </button>

          <h2 className="mb-2 text-sm font-semibold text-ink">Matched in this period</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-muted">
                <th className="py-2 pr-4">Bank transaction</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Actions</th>
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
                  <td className="py-2 pr-4">
                    <button onClick={() => handleUnmatch(txn.id)} className="text-sm text-clay hover:underline">
                      Unmatch
                    </button>
                  </td>
                </tr>
              ))}
              {matched.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-muted">
                    No matches yet in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
