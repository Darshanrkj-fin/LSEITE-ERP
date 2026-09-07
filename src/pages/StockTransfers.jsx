import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

export function StockTransfers() {
  const { profile } = useAuth()
  const canEdit = profile?.is_admin || profile?.app_roles?.includes('accountant')

  const [items, setItems] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [stockByWarehouse, setStockByWarehouse] = useState([])
  const [transfers, setTransfers] = useState([])
  const myRoles = profile?.app_roles ?? []
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [fromWarehouseId, setFromWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [transferDate, setTransferDate] = useState(today())

  const load = async () => {
    setLoading(true)
    const [
      { data: itemRows },
      { data: warehouseRows },
      { data: stockRows },
      { data: transferRows, error: fetchError },
    ] = await Promise.all([
      supabase.from('items').select('id, name').eq('type', 'good').order('name'),
      supabase.from('warehouses').select('*, branches(name)').order('name'),
      supabase.from('item_current_stock_by_warehouse').select('*'),
      supabase
        .from('stock_transfers')
        .select('*, items(name), from:warehouses!from_warehouse_id(name), to:warehouses!to_warehouse_id(name)')
        .order('created_at', { ascending: false }),
    ])
    setItems(itemRows ?? [])
    setWarehouses(warehouseRows ?? [])
    setStockByWarehouse(stockRows ?? [])
    if (fetchError) setError(fetchError.message)
    else setTransfers(transferRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canRequest = canEdit || myRoles.includes('inventory_manager')

  const availableAtSource =
    itemId && fromWarehouseId
      ? stockByWarehouse.find((s) => s.item_id === itemId && s.warehouse_id === fromWarehouseId)?.current_stock ?? 0
      : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (fromWarehouseId === toWarehouseId) {
      setError('Source and destination warehouse must differ.')
      return
    }
    setSubmitting(true)
    const { data: request, error: rpcError } = await supabase.rpc('submit_stock_transfer', {
      p_item_id: itemId,
      p_quantity: parseFloat(quantity),
      p_from_warehouse_id: fromWarehouseId,
      p_to_warehouse_id: toWarehouseId,
      p_transfer_date: transferDate,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    } else {
      setInfo('Transfer posted immediately.')
    }
    setItemId('')
    setQuantity('')
    setFromWarehouseId('')
    setToWarehouseId('')
    setTransferDate(today())
    load()
  }

  const handleCancel = async (transferId) => {
    if (!window.confirm('Cancel this stock transfer? This reverses the stock movement.')) return
    setError(null)
    setBusyId(transferId)
    const { error: rpcError } = await supabase.rpc('cancel_stock_transfer', { p_transfer_id: transferId })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Stock Transfers</h1>
      <p className="mb-6 text-sm text-muted">
        Moves stock between two of the company's own warehouses. A large transfer needs approval; a
        routine one posts immediately — the threshold is the quantity moved, not its value.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {canRequest && (
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
            <span className="mb-1 block text-muted">From warehouse</span>
            <select
              required
              value={fromWarehouseId}
              onChange={(e) => setFromWarehouseId(e.target.value)}
              className="min-w-48 rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.branches?.name} — {w.name}
                </option>
              ))}
            </select>
            {availableAtSource !== null && (
              <span className="mt-1 block text-xs text-muted">{availableAtSource} currently available there</span>
            )}
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">To warehouse</span>
            <select
              required
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              className="min-w-48 rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.branches?.name} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input
              type="date"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Request Transfer'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Qty</th>
            <th className="py-2 pr-4">From</th>
            <th className="py-2 pr-4">To</th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{t.items?.name}</td>
              <td className="py-2 pr-4">{t.quantity}</td>
              <td className="py-2 pr-4">{t.from?.name}</td>
              <td className="py-2 pr-4">{t.to?.name}</td>
              <td className="py-2 pr-4">{t.transfer_date}</td>
              <td className="py-2 pr-4">
                <span className={t.status === 'posted' ? 'text-ink' : 'text-clay'}>{t.status}</span>
              </td>
              <td className="py-2 pr-4">
                {t.status === 'posted' && canEdit && (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => handleCancel(t.id)}
                    className="text-clay hover:underline disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
          {transfers.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-muted">
                No stock transfers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
