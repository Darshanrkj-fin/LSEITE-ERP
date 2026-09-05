import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

// The commission/other_fees breakdown here is a reasonable generic model
// (Dr Bank + Dr Commission Expense = Cr Accounts Receivable), not verified
// against a real Swiggy/Zomato payout statement — see ROADMAP.md Phase 30.
export function DeliverySettlements() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [platforms, setPlatforms] = useState([])
  const [newPlatformName, setNewPlatformName] = useState('')
  const [bankAccounts, setBankAccounts] = useState([])
  const [unsettledInvoices, setUnsettledInvoices] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [platformId, setPlatformId] = useState('')
  const [settlementDate, setSettlementDate] = useState(today())
  const [selectedInvoices, setSelectedInvoices] = useState({})
  const [commission, setCommission] = useState('')
  const [otherFees, setOtherFees] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [
      { data: platformRows },
      { data: accountRows },
      { data: invoiceRows },
      { data: statusRows },
      { data: settledRows },
      { data: settlementRows, error: settlementError },
    ] = await Promise.all([
      supabase.from('delivery_platforms').select('*').order('name'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'asset').order('name'),
      supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, grand_total')
        .eq('type', 'sales')
        .eq('status', 'posted')
        .order('invoice_date'),
      supabase.from('invoice_payment_status').select('invoice_id, balance_due').eq('type', 'sales'),
      supabase.from('delivery_settlement_invoices').select('invoice_id'),
      supabase
        .from('delivery_settlements')
        .select('*, delivery_platforms(name)')
        .order('settlement_date', { ascending: false }),
    ])
    setPlatforms(platformRows ?? [])
    setBankAccounts(accountRows ?? [])
    const settledIds = new Set((settledRows ?? []).map((r) => r.invoice_id))
    const balanceById = Object.fromEntries((statusRows ?? []).map((r) => [r.invoice_id, Number(r.balance_due)]))
    setUnsettledInvoices(
      (invoiceRows ?? []).filter(
        (inv) => !settledIds.has(inv.id) && (balanceById[inv.id] ?? Number(inv.grand_total)) === Number(inv.grand_total)
      )
    )
    if (settlementError) setError(settlementError.message)
    else setSettlements(settlementRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAddPlatform = async (e) => {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('delivery_platforms').insert({ name: newPlatformName })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewPlatformName('')
    load()
  }

  const toggleInvoice = (id) => {
    setSelectedInvoices((s) => {
      const next = { ...s }
      if (id in next) delete next[id]
      else next[id] = true
      return next
    })
  }

  const selectedIds = Object.keys(selectedInvoices)
  const grossOrderValue = unsettledInvoices
    .filter((inv) => selectedIds.includes(inv.id))
    .reduce((sum, inv) => sum + Number(inv.grand_total), 0)
  const settlementAmount = grossOrderValue - (Number(commission) || 0) - (Number(otherFees) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (selectedIds.length === 0) {
      setError('Select at least one invoice this settlement covers.')
      return
    }
    setSubmitting(true)
    const { error: rpcError } = await supabase.rpc('post_delivery_settlement', {
      p_platform_id: platformId,
      p_settlement_date: settlementDate,
      p_invoice_ids: selectedIds,
      p_commission: Number(commission) || 0,
      p_other_fees: Number(otherFees) || 0,
      p_bank_account_id: bankAccountId,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setSelectedInvoices({})
    setCommission('')
    setOtherFees('')
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Delivery Settlements</h1>
      <p className="mb-6 text-sm text-muted">
        Reconcile a Swiggy/Zomato payout against the orders it covers. Gross order value is always the
        sum of the invoices you pick below, not typed in — it can never drift from what was actually
        invoiced.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {canEdit && (
        <form onSubmit={handleAddPlatform} className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Add platform</span>
            <input
              value={newPlatformName}
              onChange={(e) => setNewPlatformName(e.target.value)}
              placeholder="e.g. Swiggy"
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={!newPlatformName}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}

      {canEdit && (
        <form onSubmit={handleSubmit} className="mb-6 rounded border border-line p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">New settlement</h2>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Platform</span>
              <select
                required
                value={platformId}
                onChange={(e) => setPlatformId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Settlement date</span>
              <input
                type="date"
                required
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Deposited to</span>
              <select
                required
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="min-w-40 rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mb-2 text-sm text-muted">Orders covered by this payout:</p>
          {unsettledInvoices.length === 0 ? (
            <p className="mb-3 text-sm text-muted">No unsettled sales invoices.</p>
          ) : (
            <div className="mb-3 max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {unsettledInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100">
                      <td className="w-8 py-1">
                        <input
                          type="checkbox"
                          checked={inv.id in selectedInvoices}
                          onChange={() => toggleInvoice(inv.id)}
                        />
                      </td>
                      <td className="py-1 pr-4">{inv.invoice_number}</td>
                      <td className="py-1 pr-4">{inv.invoice_date}</td>
                      <td className="py-1 pr-4">{inv.grand_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Commission</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-28 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Other fees</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={otherFees}
                onChange={(e) => setOtherFees(e.target.value)}
                className="w-28 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-muted">Gross order value</span>
              <span className="font-semibold text-ink">{grossOrderValue.toFixed(2)}</span>
            </div>
            <div className="text-sm">
              <span className="mb-1 block text-muted">Net settlement</span>
              <span className="font-semibold text-ink">{settlementAmount.toFixed(2)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || selectedIds.length === 0}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Post Settlement'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Platform</th>
            <th className="py-2 pr-4">Gross</th>
            <th className="py-2 pr-4">Commission</th>
            <th className="py-2 pr-4">Fees</th>
            <th className="py-2 pr-4">Net Settlement</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{s.settlement_date}</td>
              <td className="py-2 pr-4">{s.delivery_platforms?.name}</td>
              <td className="py-2 pr-4">{s.gross_order_value}</td>
              <td className="py-2 pr-4">{s.commission}</td>
              <td className="py-2 pr-4">{s.other_fees}</td>
              <td className="py-2 pr-4">{s.settlement_amount}</td>
            </tr>
          ))}
          {settlements.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted">
                No settlements recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
