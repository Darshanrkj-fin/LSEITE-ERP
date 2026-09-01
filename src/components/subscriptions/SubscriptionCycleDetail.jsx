import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const emptyLine = { item_id: '', quantity: '1', rate: '' }

export function SubscriptionCycleDetail({ basePath }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [cycle, setCycle] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [items, setItems] = useState([])
  const [revenueAccounts, setRevenueAccounts] = useState([])
  const [revenueAccountId, setRevenueAccountId] = useState('')
  const [newLine, setNewLine] = useState(emptyLine)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [working, setWorking] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: c, error: cError }, { data: lines }, { data: itemRows }, { data: accountRows }] = await Promise.all([
      supabase.from('subscription_cycles').select('*, subscriptions(parties(name))').eq('id', id).single(),
      supabase.from('subscription_cycle_items').select('*, items(name)').eq('subscription_cycle_id', id).order('created_at'),
      supabase.from('items').select('id, name'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'income'),
    ])
    if (cError) setError(cError.message)
    else setCycle(c)
    setLineItems(lines ?? [])
    setItems(itemRows ?? [])
    setRevenueAccounts(accountRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id])

  const isDraft = cycle?.status === 'draft'

  const handleAddLine = async (e) => {
    e.preventDefault()
    if (!newLine.item_id || !(parseFloat(newLine.quantity) > 0) || !(parseFloat(newLine.rate) >= 0)) {
      setError('Pick an item, quantity, and rate.')
      return
    }
    setError(null)
    setWorking(true)
    const { error: insertError } = await supabase.from('subscription_cycle_items').insert({
      subscription_cycle_id: id,
      item_id: newLine.item_id,
      quantity: parseFloat(newLine.quantity),
      rate: parseFloat(newLine.rate),
    })
    setWorking(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewLine(emptyLine)
    load()
  }

  const handleRemoveLine = async (lineId) => {
    setError(null)
    const { error: deleteError } = await supabase.from('subscription_cycle_items').delete().eq('id', lineId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  const handleFinalize = async () => {
    if (!revenueAccountId) {
      setError('Pick a revenue account before finalizing.')
      return
    }
    if (!window.confirm('Finalize this cycle into a real posted invoice? This cannot be undone.')) return
    setError(null)
    setWorking(true)
    const { error: finalizeError } = await supabase.rpc('finalize_subscription_cycle', {
      p_cycle_id: id,
      p_revenue_account_id: revenueAccountId,
    })
    setWorking(false)
    if (finalizeError) {
      setError(finalizeError.message)
      return
    }
    load()
  }

  const handleSkip = async () => {
    if (!window.confirm('Skip this cycle? No invoice will be created for it.')) return
    setError(null)
    setWorking(true)
    const { error: skipError } = await supabase.from('subscription_cycles').update({ status: 'skipped' }).eq('id', id)
    setWorking(false)
    if (skipError) {
      setError(skipError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>
  if (error && !cycle) return <p className="text-sm text-clay">{error}</p>

  return (
    <div className="max-w-2xl">
      <Link to={basePath} className="mb-4 inline-block text-sm text-muted hover:underline">
        ← Back
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold font-display text-ink">{cycle.subscriptions?.parties?.name}</h1>
        <p className="text-sm text-muted">
          {cycle.cycle_date} · <span className="capitalize">{cycle.status}</span>
        </p>
        {cycle.status === 'finalized' && cycle.invoice_id && (
          <Link to={`/sales-invoices/${cycle.invoice_id}`} className="text-sm text-ink hover:underline">
            View invoice →
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Quantity</th>
            <th className="py-2 pr-4">Rate</th>
            {canEdit && isDraft && <th className="py-2 pr-4" />}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li) => (
            <tr key={li.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{li.items?.name}</td>
              <td className="py-2 pr-4">{li.quantity}</td>
              <td className="py-2 pr-4">{li.rate}</td>
              {canEdit && isDraft && (
                <td className="py-2 pr-4">
                  <button onClick={() => handleRemoveLine(li.id)} className="text-sm text-clay hover:underline">
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
          {lineItems.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-muted">
                No items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && isDraft && (
        <>
          <form onSubmit={handleAddLine} className="mb-6 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Item</span>
              <select
                value={newLine.item_id}
                onChange={(e) => setNewLine((f) => ({ ...f, item_id: e.target.value }))}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Quantity</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newLine.quantity}
                onChange={(e) => setNewLine((f) => ({ ...f, quantity: e.target.value }))}
                className="w-24 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Rate</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newLine.rate}
                onChange={(e) => setNewLine((f) => ({ ...f, rate: e.target.value }))}
                className="w-24 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={working}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              + Add item
            </button>
          </form>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Revenue account</span>
              <select
                value={revenueAccountId}
                onChange={(e) => setRevenueAccountId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {revenueAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleFinalize}
              disabled={working}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {working ? 'Working…' : 'Finalize into Invoice'}
            </button>
            <button
              onClick={handleSkip}
              disabled={working}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Skip this cycle
            </button>
          </div>
        </>
      )}
    </div>
  )
}
