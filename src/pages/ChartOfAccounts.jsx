import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const ACCOUNT_TYPES = ['asset', 'liability', 'income', 'expense', 'equity']

export function ChartOfAccounts() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState(ACCOUNT_TYPES[0])
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState(ACCOUNT_TYPES[0])
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .order('type')
      .order('name')
    if (fetchError) setError(fetchError.message)
    else setAccounts(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase
      .from('chart_of_accounts')
      .insert({ name: newName, type: newType, company_id: profile.company_id })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewName('')
    setNewType(ACCOUNT_TYPES[0])
    load()
  }

  const startEdit = (account) => {
    setEditingId(account.id)
    setEditName(account.name)
    setEditType(account.type)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('chart_of_accounts')
      .update({ name: editName, type: editType })
      .eq('id', id)
    setSavingEdit(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditingId(null)
    load()
  }

  const handleDelete = async (account) => {
    if (!window.confirm(`Delete account "${account.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase
      .from('chart_of_accounts')
      .delete()
      .eq('id', account.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Chart of Accounts</h1>
      <p className="mb-6 text-sm text-slate-500">Accounts used to post journal entries.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Type</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id} className="border-b border-slate-100">
              {editingId === account.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(account.id)}
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
                  <td className="py-2 pr-4">{account.name}</td>
                  <td className="py-2 pr-4 capitalize">{account.type}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(account)} className="text-sm text-slate-800 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(account)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-slate-400">
                No accounts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Name</span>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Type</span>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add account'}
          </button>
        </form>
      )}
    </div>
  )
}
