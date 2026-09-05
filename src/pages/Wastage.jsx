import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

const REASONS = ['spoilage', 'expired', 'damaged', 'production_loss', 'preparation_loss', 'quality_rejection', 'other']

export function Wastage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [items, setItems] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [wastageDate, setWastageDate] = useState(today())
  const [submitting, setSubmitting] = useState(false)
  const [info, setInfo] = useState(null)

  const load = async () => {
    setLoading(true)
    const [{ data: itemRows }, { data: entryRows, error: fetchError }] = await Promise.all([
      supabase.from('items').select('id, name, item_type').eq('type', 'good'),
      supabase
        .from('wastage')
        .select('*, items(name)')
        .order('wastage_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])
    setItems(itemRows ?? [])
    if (fetchError) setError(fetchError.message)
    else setEntries(entryRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { data: request, error: rpcError } = await supabase.rpc('submit_wastage', {
      p_item_id: itemId,
      p_quantity: parseFloat(quantity),
      p_reason: reason,
      p_wastage_date: wastageDate,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    }
    setItemId('')
    setQuantity('')
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Wastage</h1>
      <p className="mb-6 text-sm text-muted">
        Spoilage, damage, or loss write-offs. Posts a stock outflow and an expense at the item's own
        costed value — the same FEFO consumption a sale or production entry uses, so this always
        reflects what the item actually cost, never a guessed figure.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {canEdit && (
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
            <span className="mb-1 block text-muted">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 capitalize"
            >
              {REASONS.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input
              type="date"
              required
              value={wastageDate}
              onChange={(e) => setWastageDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Recording…' : 'Record Wastage'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Quantity</th>
            <th className="py-2 pr-4">Reason</th>
            <th className="py-2 pr-4">Cost</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{entry.wastage_date}</td>
              <td className="py-2 pr-4">{entry.items?.name}</td>
              <td className="py-2 pr-4">{entry.quantity}</td>
              <td className="py-2 pr-4 capitalize">{entry.reason.replace('_', ' ')}</td>
              <td className="py-2 pr-4">{entry.cost}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted">
                No wastage recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
