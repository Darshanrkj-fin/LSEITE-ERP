import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['open', 'fulfilled', 'cancelled']
const today = () => new Date().toISOString().slice(0, 10)

const emptyOrder = { party_id: '', description: '', order_date: today(), status: 'open' }

export function CustomOrders() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [orders, setOrders] = useState([])
  const [parties, setParties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newOrder, setNewOrder] = useState(emptyOrder)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editOrder, setEditOrder] = useState(emptyOrder)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data, error: fetchError }, { data: partyRows }] = await Promise.all([
      supabase.from('custom_orders').select('*, parties(name)').order('order_date', { ascending: false }),
      supabase.from('parties').select('id, name').eq('type', 'customer').order('name'),
    ])
    if (fetchError) setError(fetchError.message)
    else setOrders(data)
    setParties(partyRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('custom_orders').insert({
      party_id: newOrder.party_id,
      description: newOrder.description || null,
      order_date: newOrder.order_date,
      status: newOrder.status,
      company_id: profile.company_id,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewOrder(emptyOrder)
    load()
  }

  const startEdit = (order) => {
    setEditingId(order.id)
    setEditOrder({ ...order, description: order.description ?? '' })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('custom_orders')
      .update({
        party_id: editOrder.party_id,
        description: editOrder.description || null,
        order_date: editOrder.order_date,
        status: editOrder.status,
      })
      .eq('id', id)
    setSavingEdit(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditingId(null)
    load()
  }

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete this custom order for "${order.parties?.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('custom_orders').delete().eq('id', order.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Custom Orders</h1>
      <p className="mb-6 text-sm text-slate-500">
        A lightweight tag for occasional bespoke/bulk orders (e.g. a wedding order) — tag a production entry or sales
        invoice against one here to look at its cost/revenue separately later. No pricing or quotation is tracked.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Order date</th>
            <th className="py-2 pr-4">Status</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-slate-100">
              {editingId === order.id ? (
                <>
                  <td className="py-2 pr-4">
                    <select
                      value={editOrder.party_id}
                      onChange={(e) => setEditOrder((f) => ({ ...f, party_id: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editOrder.description}
                      onChange={(e) => setEditOrder((f) => ({ ...f, description: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editOrder.order_date}
                      onChange={(e) => setEditOrder((f) => ({ ...f, order_date: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editOrder.status}
                      onChange={(e) => setEditOrder((f) => ({ ...f, status: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(order.id)}
                      disabled={savingEdit}
                      className="text-sm text-slate-800 hover:underline"
                    >
                      Save
                    </button>
                    <button onClick={cancelEdit} className="text-sm text-slate-500 hover:underline">
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4">{order.parties?.name}</td>
                  <td className="py-2 pr-4">{order.description || '—'}</td>
                  <td className="py-2 pr-4">{order.order_date}</td>
                  <td className="py-2 pr-4 capitalize">{order.status}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(order)} className="text-sm text-slate-800 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(order)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-slate-400">
                No custom orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Customer</span>
            <select
              required
              value={newOrder.party_id}
              onChange={(e) => setNewOrder((f) => ({ ...f, party_id: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Description</span>
            <input
              placeholder="e.g. Sharma wedding, 200 boxes"
              value={newOrder.description}
              onChange={(e) => setNewOrder((f) => ({ ...f, description: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Order date</span>
            <input
              type="date"
              required
              value={newOrder.order_date}
              onChange={(e) => setNewOrder((f) => ({ ...f, order_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Status</span>
            <select
              value={newOrder.status}
              onChange={(e) => setNewOrder((f) => ({ ...f, status: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add custom order'}
          </button>
        </form>
      )}
    </div>
  )
}
