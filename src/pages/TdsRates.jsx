import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyRate = { section: '', rate: '', effective_from: '', effective_to: '' }

export function TdsRates() {
  const { profile } = useAuth()
  // Matches the tds_rates_write/update/delete RLS policies: admin only,
  // not accountant — rate changes are reviewed manually, never auto-applied
  // (same reasoning as TaxRates.jsx).
  const canEdit = profile?.role === 'admin'

  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newRate, setNewRate] = useState(emptyRate)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editRate, setEditRate] = useState(emptyRate)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('tds_rates')
      .select('*')
      .order('section')
      .order('effective_from', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setRates(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('tds_rates').insert({
      section: newRate.section,
      rate: newRate.rate,
      effective_from: newRate.effective_from,
      effective_to: newRate.effective_to || null,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewRate(emptyRate)
    load()
  }

  const startEdit = (rate) => {
    setEditingId(rate.id)
    setEditRate({ ...rate, effective_to: rate.effective_to ?? '' })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('tds_rates')
      .update({
        section: editRate.section,
        rate: editRate.rate,
        effective_from: editRate.effective_from,
        effective_to: editRate.effective_to || null,
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

  const handleDelete = async (rate) => {
    if (!window.confirm(`Delete TDS rate for section "${rate.section}" (${rate.rate}%)? This cannot be undone.`))
      return
    setError(null)
    const { error: deleteError } = await supabase.from('tds_rates').delete().eq('id', rate.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">TDS Rates</h1>
      <p className="mb-6 text-sm text-muted">
        TDS rates by section, deducted when recording a payment against a purchase invoice — never
        hardcoded, same discipline as GST rates.
        {!canEdit && ' Only an admin can add or change rates.'}
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Section</th>
            <th className="py-2 pr-4">Rate (%)</th>
            <th className="py-2 pr-4">Effective from</th>
            <th className="py-2 pr-4">Effective to</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <tr key={rate.id} className="border-b border-slate-100">
              {editingId === rate.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      value={editRate.section}
                      onChange={(e) => setEditRate((f) => ({ ...f, section: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editRate.rate}
                      onChange={(e) => setEditRate((f) => ({ ...f, rate: e.target.value }))}
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editRate.effective_from}
                      onChange={(e) => setEditRate((f) => ({ ...f, effective_from: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editRate.effective_to}
                      onChange={(e) => setEditRate((f) => ({ ...f, effective_to: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(rate.id)}
                      disabled={savingEdit}
                      className="text-sm text-ink hover:underline"
                    >
                      Save
                    </button>
                    <button onClick={cancelEdit} className="text-sm text-muted hover:underline">
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4">{rate.section}</td>
                  <td className="py-2 pr-4">{rate.rate}%</td>
                  <td className="py-2 pr-4">{rate.effective_from}</td>
                  <td className="py-2 pr-4">{rate.effective_to || '—'}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(rate)} className="text-sm text-ink hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(rate)} className="text-sm text-clay hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {rates.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted">
                No TDS rates yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Section</span>
            <input
              required
              value={newRate.section}
              onChange={(e) => setNewRate((f) => ({ ...f, section: e.target.value }))}
              placeholder="e.g. 194J"
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Rate (%)</span>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={newRate.rate}
              onChange={(e) => setNewRate((f) => ({ ...f, rate: e.target.value }))}
              className="w-24 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Effective from</span>
            <input
              type="date"
              required
              value={newRate.effective_from}
              onChange={(e) => setNewRate((f) => ({ ...f, effective_from: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Effective to</span>
            <input
              type="date"
              placeholder="leave blank if still active"
              value={newRate.effective_to}
              onChange={(e) => setNewRate((f) => ({ ...f, effective_to: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add rate'}
          </button>
        </form>
      )}
    </div>
  )
}
