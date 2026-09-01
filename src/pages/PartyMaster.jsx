import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const PARTY_TYPES = ['customer', 'vendor']

const emptyParty = {
  name: '',
  gstin: '',
  state_code: '',
  type: 'customer',
  email: '',
  phone: '',
  billing_address: '',
  shipping_address: '',
}

export function PartyMaster() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [parties, setParties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newParty, setNewParty] = useState(emptyParty)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editParty, setEditParty] = useState(emptyParty)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('parties')
      .select('*')
      .order('name')
    if (fetchError) setError(fetchError.message)
    else setParties(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('parties').insert({
      name: newParty.name,
      gstin: newParty.gstin || null,
      state_code: newParty.state_code,
      type: newParty.type,
      email: newParty.email || null,
      phone: newParty.phone || null,
      billing_address: newParty.billing_address || null,
      shipping_address: newParty.shipping_address || null,
      company_id: profile.company_id,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewParty(emptyParty)
    load()
  }

  const startEdit = (party) => {
    setEditingId(party.id)
    setEditParty({
      ...party,
      gstin: party.gstin ?? '',
      email: party.email ?? '',
      phone: party.phone ?? '',
      billing_address: party.billing_address ?? '',
      shipping_address: party.shipping_address ?? '',
    })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('parties')
      .update({
        name: editParty.name,
        gstin: editParty.gstin || null,
        state_code: editParty.state_code,
        type: editParty.type,
        email: editParty.email || null,
        phone: editParty.phone || null,
        billing_address: editParty.billing_address || null,
        shipping_address: editParty.shipping_address || null,
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

  const handleDelete = async (party) => {
    if (!window.confirm(`Delete party "${party.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('parties').delete().eq('id', party.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-6xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Party Master</h1>
      <p className="mb-6 text-sm text-slate-500">Customers and vendors used on invoices.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">GSTIN</th>
            <th className="py-2 pr-4">State code</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Phone</th>
            <th className="py-2 pr-4">Billing address</th>
            <th className="py-2 pr-4">Shipping address</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {parties.map((party) => (
            <tr key={party.id} className="border-b border-slate-100">
              {editingId === party.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      value={editParty.name}
                      onChange={(e) => setEditParty((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editParty.gstin}
                      onChange={(e) => setEditParty((f) => ({ ...f, gstin: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      maxLength={2}
                      value={editParty.state_code}
                      onChange={(e) => setEditParty((f) => ({ ...f, state_code: e.target.value }))}
                      className="w-16 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editParty.type}
                      onChange={(e) => setEditParty((f) => ({ ...f, type: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {PARTY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="email"
                      value={editParty.email}
                      onChange={(e) => setEditParty((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editParty.phone}
                      onChange={(e) => setEditParty((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editParty.billing_address}
                      onChange={(e) => setEditParty((f) => ({ ...f, billing_address: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editParty.shipping_address}
                      onChange={(e) => setEditParty((f) => ({ ...f, shipping_address: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(party.id)}
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
                  <td className="py-2 pr-4">{party.name}</td>
                  <td className="py-2 pr-4">{party.gstin || '—'}</td>
                  <td className="py-2 pr-4">{party.state_code}</td>
                  <td className="py-2 pr-4 capitalize">{party.type}</td>
                  <td className="py-2 pr-4">{party.email || '—'}</td>
                  <td className="py-2 pr-4">{party.phone || '—'}</td>
                  <td className="py-2 pr-4">{party.billing_address || '—'}</td>
                  <td className="py-2 pr-4">{party.shipping_address || '—'}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(party)} className="text-sm text-slate-800 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(party)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {parties.length === 0 && (
            <tr>
              <td colSpan={9} className="py-4 text-slate-400">
                No parties yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Name</span>
            <input
              required
              value={newParty.name}
              onChange={(e) => setNewParty((f) => ({ ...f, name: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">GSTIN</span>
            <input
              placeholder="leave blank if unregistered"
              value={newParty.gstin}
              onChange={(e) => setNewParty((f) => ({ ...f, gstin: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">State code</span>
            <input
              required
              maxLength={2}
              placeholder="e.g. 29"
              value={newParty.state_code}
              onChange={(e) => setNewParty((f) => ({ ...f, state_code: e.target.value }))}
              className="w-20 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Type</span>
            <select
              value={newParty.type}
              onChange={(e) => setNewParty((f) => ({ ...f, type: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Email</span>
            <input
              type="email"
              placeholder="for emailing invoice PDFs"
              value={newParty.email}
              onChange={(e) => setNewParty((f) => ({ ...f, email: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Phone</span>
            <input
              value={newParty.phone}
              onChange={(e) => setNewParty((f) => ({ ...f, phone: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Billing address</span>
            <input
              value={newParty.billing_address}
              onChange={(e) => setNewParty((f) => ({ ...f, billing_address: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Shipping address</span>
            <input
              value={newParty.shipping_address}
              onChange={(e) => setNewParty((f) => ({ ...f, shipping_address: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add party'}
          </button>
        </form>
      )}
    </div>
  )
}
