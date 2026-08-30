import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const FREQUENCIES = ['weekly', 'monthly']
const STATUSES = ['active', 'paused', 'cancelled']
const today = () => new Date().toISOString().slice(0, 10)

const emptySubscription = { party_id: '', frequency: 'weekly', status: 'active', start_date: today() }

export function Subscriptions() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [subscriptions, setSubscriptions] = useState([])
  const [parties, setParties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newSub, setNewSub] = useState(emptySubscription)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editSub, setEditSub] = useState(emptySubscription)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data, error: fetchError }, { data: partyRows }] = await Promise.all([
      supabase.from('subscriptions').select('*, parties(name)').order('start_date', { ascending: false }),
      supabase.from('parties').select('id, name').eq('type', 'customer').order('name'),
    ])
    if (fetchError) setError(fetchError.message)
    else setSubscriptions(data)
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
    const { error: insertError } = await supabase.from('subscriptions').insert({
      party_id: newSub.party_id,
      frequency: newSub.frequency,
      status: newSub.status,
      start_date: newSub.start_date,
      company_id: profile.company_id,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewSub(emptySubscription)
    load()
  }

  const startEdit = (sub) => {
    setEditingId(sub.id)
    setEditSub(sub)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        party_id: editSub.party_id,
        frequency: editSub.frequency,
        status: editSub.status,
        start_date: editSub.start_date,
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

  const handleDelete = async (sub) => {
    if (!window.confirm(`Delete this subscription for "${sub.parties?.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('subscriptions').delete().eq('id', sub.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Subscriptions</h1>
      <p className="mb-6 text-sm text-slate-500">
        Recurring customer plans. Each cycle's actual items are managed separately under Subscription Cycles — a
        subscription here is just who, how often, and whether it's currently active.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Frequency</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Start date</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => (
            <tr key={sub.id} className="border-b border-slate-100">
              {editingId === sub.id ? (
                <>
                  <td className="py-2 pr-4">
                    <select
                      value={editSub.party_id}
                      onChange={(e) => setEditSub((f) => ({ ...f, party_id: e.target.value }))}
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
                    <select
                      value={editSub.frequency}
                      onChange={(e) => setEditSub((f) => ({ ...f, frequency: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editSub.status}
                      onChange={(e) => setEditSub((f) => ({ ...f, status: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editSub.start_date}
                      onChange={(e) => setEditSub((f) => ({ ...f, start_date: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(sub.id)}
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
                  <td className="py-2 pr-4">{sub.parties?.name}</td>
                  <td className="py-2 pr-4 capitalize">{sub.frequency}</td>
                  <td className="py-2 pr-4 capitalize">{sub.status}</td>
                  <td className="py-2 pr-4">{sub.start_date}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(sub)} className="text-sm text-slate-800 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(sub)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {subscriptions.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-slate-400">
                No subscriptions yet.
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
              value={newSub.party_id}
              onChange={(e) => setNewSub((f) => ({ ...f, party_id: e.target.value }))}
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
            <span className="mb-1 block text-slate-600">Frequency</span>
            <select
              value={newSub.frequency}
              onChange={(e) => setNewSub((f) => ({ ...f, frequency: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Status</span>
            <select
              value={newSub.status}
              onChange={(e) => setNewSub((f) => ({ ...f, status: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Start date</span>
            <input
              type="date"
              required
              value={newSub.start_date}
              onChange={(e) => setNewSub((f) => ({ ...f, start_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add subscription'}
          </button>
        </form>
      )}
    </div>
  )
}
