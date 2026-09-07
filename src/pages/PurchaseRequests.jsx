import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

export function PurchaseRequests() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = profile?.is_admin || profile?.app_roles?.includes('accountant')

  const [items, setItems] = useState([])
  const [vendors, setVendors] = useState([])
  const [expenseAccounts, setExpenseAccounts] = useState([])
  const [orders, setOrders] = useState([])
  const myRoles = profile?.app_roles ?? []
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [estimatedAmount, setEstimatedAmount] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [notes, setNotes] = useState('')

  // Inline "create invoice" mini-form state, per order
  const [invoiceDraft, setInvoiceDraft] = useState({}) // order id -> { rate, accountId, date }

  const load = async () => {
    setLoading(true)
    const [{ data: itemRows }, { data: vendorRows }, { data: accountRows }, { data: orderRows, error: fetchError }] =
      await Promise.all([
        supabase.from('items').select('id, name').order('name'),
        supabase.from('parties').select('id, name').eq('type', 'vendor').order('name'),
        supabase.from('chart_of_accounts').select('id, name').eq('type', 'expense'),
        supabase
          .from('purchase_orders')
          .select('*, items(name), parties(name), purchase_requests(estimated_amount, notes, requested_by)')
          .order('created_at', { ascending: false }),
      ])
    setItems(itemRows ?? [])
    setVendors(vendorRows ?? [])
    setExpenseAccounts(accountRows ?? [])
    if (fetchError) setError(fetchError.message)
    else setOrders(orderRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canCreateRequest = canEdit || myRoles.includes('inventory_manager')
  const canCancelOrder = canEdit || myRoles.includes('coo')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { data: request, error: rpcError } = await supabase.rpc('submit_purchase_request', {
      p_item_id: itemId,
      p_quantity: parseFloat(quantity),
      p_estimated_amount: parseFloat(estimatedAmount) || 0,
      p_vendor_party_id: vendorId || null,
      p_notes: notes || null,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    } else {
      setInfo('Purchase request approved immediately — order created.')
    }
    setItemId('')
    setQuantity('')
    setEstimatedAmount('')
    setVendorId('')
    setNotes('')
    load()
  }

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this purchase order?')) return
    setError(null)
    setBusyId(orderId)
    const { error: rpcError } = await supabase.rpc('cancel_purchase_order', { p_purchase_order_id: orderId })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  const updateDraft = (orderId, field, value) => {
    setInvoiceDraft((d) => ({ ...d, [orderId]: { rate: '', accountId: '', date: today(), ...d[orderId], [field]: value } }))
  }

  const handleCreateInvoice = async (order) => {
    const draft = invoiceDraft[order.id] ?? {}
    if (!draft.rate || !draft.accountId) {
      setError('Enter a rate and pick an expense account before creating the invoice.')
      return
    }
    setError(null)
    setInfo(null)
    setBusyId(order.id)
    const { data: request, error: rpcError } = await supabase.rpc('submit_purchase_invoice', {
      p_party_id: order.vendor_party_id,
      p_invoice_date: draft.date || today(),
      p_revenue_expense_account_id: draft.accountId,
      p_line_items: [{ item_id: order.item_id, quantity: order.quantity, rate: parseFloat(draft.rate) }],
      p_custom_order_id: null,
      p_purchase_order_id: order.id,
    })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Invoice submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
      load()
      return
    }
    navigate(`/purchase-invoices/${request.result_entity_id}`)
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Purchase Requests &amp; Orders</h1>
      <p className="mb-6 text-sm text-muted">
        A request needs approval before it becomes an order; an order still needs a real purchase invoice
        (with an actual negotiated rate) before anything posts to the ledger — that invoice goes through
        its own existing approval gate above a configured amount.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {canCreateRequest && (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3 rounded border border-line p-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Item</span>
            <select
              required
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="min-w-40 rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Quantity</span>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-28 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Estimated amount</span>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={estimatedAmount}
              onChange={(e) => setEstimatedAmount(e.target.value)}
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Vendor (optional)</span>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="min-w-40 rounded border border-slate-300 px-3 py-2"
            >
              <option value="">None</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Request Purchase'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Qty</th>
            <th className="py-2 pr-4">Vendor</th>
            <th className="py-2 pr-4">Est. amount</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-4">{o.items?.name}</td>
              <td className="py-2 pr-4">{o.quantity}</td>
              <td className="py-2 pr-4">{o.parties?.name ?? '—'}</td>
              <td className="py-2 pr-4">{o.purchase_requests?.estimated_amount}</td>
              <td className="py-2 pr-4">
                <span className={o.status === 'open' ? 'text-ink' : o.status === 'fulfilled' ? 'text-muted' : 'text-clay'}>
                  {o.status}
                </span>
              </td>
              <td className="py-2 pr-4">
                {o.status === 'open' && canEdit && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Rate"
                        value={invoiceDraft[o.id]?.rate ?? ''}
                        onChange={(e) => updateDraft(o.id, 'rate', e.target.value)}
                        className="w-20 rounded border border-slate-300 px-2 py-1"
                      />
                      <select
                        value={invoiceDraft[o.id]?.accountId ?? ''}
                        onChange={(e) => updateDraft(o.id, 'accountId', e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1"
                      >
                        <option value="">Expense account…</option>
                        {expenseAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === o.id || !o.vendor_party_id}
                      onClick={() => handleCreateInvoice(o)}
                      className="text-ink hover:underline disabled:opacity-50"
                      title={!o.vendor_party_id ? 'This order has no vendor set' : undefined}
                    >
                      Create Invoice
                    </button>
                  </div>
                )}
                {o.status === 'open' && canCancelOrder && (
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => handleCancelOrder(o.id)}
                    className="mt-1 block text-clay hover:underline disabled:opacity-50"
                  >
                    Cancel Order
                  </button>
                )}
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted">
                No purchase orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
