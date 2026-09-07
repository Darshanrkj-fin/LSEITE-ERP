import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export function Branches() {
  const { profile } = useAuth()
  const canEdit = profile?.is_admin || profile?.app_roles?.includes('accountant')

  const [branches, setBranches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchState, setNewBranchState] = useState('')
  const [addingBranch, setAddingBranch] = useState(false)

  const [newWarehouseName, setNewWarehouseName] = useState({})
  const [addingWarehouse, setAddingWarehouse] = useState(null)

  const load = async () => {
    setLoading(true)
    const [{ data: branchRows, error: branchError }, { data: warehouseRows, error: warehouseError }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('warehouses').select('*').order('name'),
    ])
    if (branchError) setError(branchError.message)
    else if (warehouseError) setError(warehouseError.message)
    setBranches(branchRows ?? [])
    setWarehouses(warehouseRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAddBranch = async (e) => {
    e.preventDefault()
    setError(null)
    setAddingBranch(true)
    const { error: insertError } = await supabase
      .from('branches')
      .insert({ company_id: profile.company_id, name: newBranchName, state_code: newBranchState })
    setAddingBranch(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewBranchName('')
    setNewBranchState('')
    load()
  }

  const handleAddWarehouse = async (branchId) => {
    const name = newWarehouseName[branchId]
    if (!name?.trim()) return
    setError(null)
    setAddingWarehouse(branchId)
    const { error: insertError } = await supabase
      .from('warehouses')
      .insert({ company_id: profile.company_id, branch_id: branchId, name })
    setAddingWarehouse(null)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewWarehouseName((w) => ({ ...w, [branchId]: '' }))
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Branches &amp; Warehouses</h1>
      <p className="mb-6 text-sm text-muted">
        Each branch needs at least one warehouse before stock can be tracked there. There's no way to
        delete a branch/warehouse or change which one is the default here yet — both are deliberately out
        of scope for now.
        {!canEdit && ' Only an admin or accountant can add branches or warehouses.'}
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <ul className="space-y-4">
        {branches.map((branch) => (
          <li key={branch.id} className="rounded border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-ink">
                {branch.name} {branch.is_default && <span className="text-xs text-muted">(default)</span>}
              </span>
              <span className="text-sm text-muted">State code {branch.state_code}</span>
            </div>
            <ul className="mb-2 space-y-1 border-l-2 border-slate-200 pl-3 text-sm">
              {warehouses
                .filter((w) => w.branch_id === branch.id)
                .map((w) => (
                  <li key={w.id} className="text-muted">
                    {w.name} {w.is_default && <span className="text-xs">(default)</span>}
                  </li>
                ))}
              {warehouses.filter((w) => w.branch_id === branch.id).length === 0 && (
                <li className="text-muted">No warehouses yet.</li>
              )}
            </ul>
            {canEdit && (
              <div className="flex items-end gap-2">
                <input
                  type="text"
                  placeholder="New warehouse name"
                  value={newWarehouseName[branch.id] ?? ''}
                  onChange={(e) => setNewWarehouseName((w) => ({ ...w, [branch.id]: e.target.value }))}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  disabled={addingWarehouse === branch.id}
                  onClick={() => handleAddWarehouse(branch.id)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  Add warehouse
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form onSubmit={handleAddBranch} className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">New branch name</span>
            <input
              required
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">State code</span>
            <input
              required
              value={newBranchState}
              onChange={(e) => setNewBranchState(e.target.value)}
              placeholder="e.g. 29"
              className="w-24 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={addingBranch}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {addingBranch ? 'Adding…' : 'Add branch'}
          </button>
        </form>
      )}
    </div>
  )
}
