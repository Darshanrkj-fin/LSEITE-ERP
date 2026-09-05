import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'

const today = () => new Date().toISOString().slice(0, 10)
const emptyAsset = { category_id: '', name: '', asset_code: '', purchase_date: today(), cost: '', salvage_value: '0', funding_account_id: '' }

const COLUMNS = [
  { key: 'name', label: 'Asset' },
  { key: 'category_name', label: 'Category' },
  { key: 'purchase_date', label: 'Purchase date' },
  { key: 'cost', label: 'Cost' },
  { key: 'accumulated_depreciation', label: 'Accum. depreciation' },
  { key: 'net_book_value', label: 'Net book value' },
  { key: 'status', label: 'Status' },
]

export function FixedAssets() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [assets, setAssets] = useState([])
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newAsset, setNewAsset] = useState(emptyAsset)
  const [submitting, setSubmitting] = useState(false)

  const [disposingId, setDisposingId] = useState(null)
  const [disposalProceeds, setDisposalProceeds] = useState('')
  const [disposalAccountId, setDisposalAccountId] = useState('')
  const [disposalDate, setDisposalDate] = useState(today())

  const load = async () => {
    setLoading(true)
    const [{ data: register, error: fetchError }, { data: cats }, { data: accts }] = await Promise.all([
      supabase.rpc('fixed_asset_register'),
      supabase.from('asset_categories').select('id, name'),
      supabase.from('chart_of_accounts').select('id, name, type').in('type', ['asset', 'liability']),
    ])
    if (fetchError) setError(fetchError.message)
    else setAssets((register ?? []).map((r) => ({ ...r, category_name: r.category_name })))
    setCategories(cats ?? [])
    setAccounts(accts ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleCapitalize = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: rpcError } = await supabase.rpc('capitalize_fixed_asset', {
      p_category_id: newAsset.category_id,
      p_name: newAsset.name,
      p_asset_code: newAsset.asset_code || null,
      p_purchase_date: newAsset.purchase_date,
      p_cost: parseFloat(newAsset.cost),
      p_salvage_value: parseFloat(newAsset.salvage_value || '0'),
      p_funding_account_id: newAsset.funding_account_id,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setNewAsset(emptyAsset)
    load()
  }

  const startDispose = (asset) => {
    setDisposingId(asset.asset_id)
    setDisposalProceeds('')
    setDisposalAccountId('')
    setDisposalDate(today())
  }

  const handleDispose = async (e) => {
    e.preventDefault()
    setError(null)
    const { error: rpcError } = await supabase.rpc('dispose_fixed_asset', {
      p_asset_id: disposingId,
      p_disposal_date: disposalDate,
      p_proceeds: parseFloat(disposalProceeds || '0'),
      p_receiving_account_id: disposalAccountId,
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setDisposingId(null)
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  const assetAccounts = accounts.filter((a) => a.type === 'asset')

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold font-display text-ink">Fixed Assets</h1>
          <p className="text-sm text-muted">
            Straight-line depreciation only. GST input-credit rules for capital goods aren't handled here —
            confirm with your CA.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadCsv('fixed-asset-register.csv', COLUMNS, assets)}
            disabled={assets.length === 0}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            onClick={() => downloadTablePdf({ filename: 'fixed-asset-register.pdf', title: 'Fixed Asset Register', columns: COLUMNS, rows: assets })}
            disabled={assets.length === 0}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Download PDF
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Asset</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Purchased</th>
            <th className="py-2 pr-4">Cost</th>
            <th className="py-2 pr-4">Accum. Dep.</th>
            <th className="py-2 pr-4">NBV</th>
            <th className="py-2 pr-4">Status</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.asset_id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{a.name}</td>
              <td className="py-2 pr-4">{a.category_name}</td>
              <td className="py-2 pr-4">{a.purchase_date}</td>
              <td className="py-2 pr-4">{a.cost}</td>
              <td className="py-2 pr-4">{a.accumulated_depreciation}</td>
              <td className="py-2 pr-4">{a.net_book_value}</td>
              <td className="py-2 pr-4 capitalize">{a.status}</td>
              {canEdit && (
                <td className="py-2 pr-4">
                  {a.status === 'active' && (
                    <button onClick={() => startDispose(a)} className="text-sm text-clay hover:underline">
                      Dispose
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {assets.length === 0 && (
            <tr>
              <td colSpan={8} className="py-4 text-muted">
                No fixed assets yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {disposingId && (
        <form onSubmit={handleDispose} className="mb-6 flex flex-wrap items-end gap-3 rounded border border-line p-3">
          <h2 className="w-full text-sm font-semibold text-ink">Dispose asset</h2>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Disposal date</span>
            <input type="date" required value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Proceeds</span>
            <input type="number" step="0.01" min="0" value={disposalProceeds} onChange={(e) => setDisposalProceeds(e.target.value)} className="w-28 rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Received into</span>
            <select required value={disposalAccountId} onChange={(e) => setDisposalAccountId(e.target.value)} className="min-w-40 rounded border border-slate-300 px-3 py-2">
              <option value="">Select…</option>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Confirm Disposal
          </button>
          <button type="button" onClick={() => setDisposingId(null)} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        </form>
      )}

      {canEdit && (
        <form onSubmit={handleCapitalize} className="rounded border border-line p-3">
          <h2 className="mb-3 text-sm font-semibold text-ink">Capitalize a new asset</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Category</span>
              <select required value={newAsset.category_id} onChange={(e) => setNewAsset((f) => ({ ...f, category_id: e.target.value }))} className="rounded border border-slate-300 px-3 py-2">
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Name</span>
              <input required value={newAsset.name} onChange={(e) => setNewAsset((f) => ({ ...f, name: e.target.value }))} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Asset code</span>
              <input value={newAsset.asset_code} onChange={(e) => setNewAsset((f) => ({ ...f, asset_code: e.target.value }))} className="w-28 rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Purchase date</span>
              <input type="date" required value={newAsset.purchase_date} onChange={(e) => setNewAsset((f) => ({ ...f, purchase_date: e.target.value }))} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Cost</span>
              <input type="number" required step="0.01" min="0.01" value={newAsset.cost} onChange={(e) => setNewAsset((f) => ({ ...f, cost: e.target.value }))} className="w-28 rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Salvage value</span>
              <input type="number" step="0.01" min="0" value={newAsset.salvage_value} onChange={(e) => setNewAsset((f) => ({ ...f, salvage_value: e.target.value }))} className="w-28 rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Funded via</span>
              <select required value={newAsset.funding_account_id} onChange={(e) => setNewAsset((f) => ({ ...f, funding_account_id: e.target.value }))} className="min-w-40 rounded border border-slate-300 px-3 py-2">
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={submitting} className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Capitalizing…' : 'Capitalize Asset'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
