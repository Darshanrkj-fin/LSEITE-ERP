import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyCategory = { name: '', useful_life_years: '' }

export function AssetCategories() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newCategory, setNewCategory] = useState(emptyCategory)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase.from('asset_categories').select('*').order('name')
    if (fetchError) setError(fetchError.message)
    else setCategories(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('asset_categories').insert({
      company_id: profile.company_id,
      name: newCategory.name,
      useful_life_years: parseFloat(newCategory.useful_life_years),
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewCategory(emptyCategory)
    load()
  }

  const handleDelete = async (category) => {
    if (!window.confirm(`Delete asset category "${category.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('asset_categories').delete().eq('id', category.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Asset Categories</h1>
      <p className="mb-6 text-sm text-muted">
        Useful life drives straight-line monthly depreciation — the only method built so far.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Useful life (years)</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{c.name}</td>
              <td className="py-2 pr-4">{c.useful_life_years}</td>
              {canEdit && (
                <td className="py-2 pr-4">
                  <button onClick={() => handleDelete(c)} className="text-sm text-clay hover:underline">
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
          {categories.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-muted">
                No asset categories yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input
              required
              value={newCategory.name}
              onChange={(e) => setNewCategory((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ovens & Equipment"
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Useful life (years)</span>
            <input
              type="number"
              required
              min="0.1"
              step="0.1"
              value={newCategory.useful_life_years}
              onChange={(e) => setNewCategory((f) => ({ ...f, useful_life_years: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add category'}
          </button>
        </form>
      )}
    </div>
  )
}
