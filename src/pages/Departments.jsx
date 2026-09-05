import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

function LookupList({ table, title, canEdit, companyId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase.from(table).select('*').order('name')
    if (fetchError) setError(fetchError.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from(table).insert({ company_id: companyId, name: newName })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewName('')
    load()
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from(table).delete().eq('id', row.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  return (
    <div className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      {error && <p className="mb-2 text-sm text-clay">{error}</p>}
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <table className="mb-3 w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.name}</td>
                {canEdit && (
                  <td className="py-2 pr-4">
                    <button onClick={() => handleDelete(r)} className="text-sm text-clay hover:underline">
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-2 text-muted">None yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={handleAdd} className="flex items-end gap-3">
          <input
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}
    </div>
  )
}

export function Departments() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Departments & Designations</h1>
      <p className="mb-6 text-sm text-muted">Simple lookup lists used on Employee Master.</p>

      <LookupList table="departments" title="Departments" canEdit={canEdit} companyId={profile.company_id} />
      <LookupList table="designations" title="Designations" canEdit={canEdit} companyId={profile.company_id} />
    </div>
  )
}
