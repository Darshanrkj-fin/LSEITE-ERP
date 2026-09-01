import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const ITEM_TYPES = ['good', 'service']
// Which side of the manufacturing process a good sits on. Only meaningful
// for type='good' — '' means "not set" (a plain trading good, or a
// service where this doesn't apply).
const MANUFACTURING_TYPES = ['', 'raw_material', 'finished_good']
const MANUFACTURING_TYPE_LABELS = { '': '—', raw_material: 'Raw material', finished_good: 'Finished good' }

const emptyItem = {
  name: '',
  hsn_sac_code: '',
  unit: '',
  opening_stock: '0',
  low_stock_threshold: '',
  type: 'good',
  item_type: '',
  category: '',
}

const CSV_COLUMNS = ['name', 'hsn_sac_code', 'unit', 'type', 'opening_stock', 'low_stock_threshold', 'item_type', 'category']

// Small hand-written CSV parser (no new dependency) — handles quoted
// fields so a name or category containing a comma still parses correctly.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function ItemMaster() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newItem, setNewItem] = useState(emptyItem)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editItem, setEditItem] = useState(emptyItem)
  const [savingEdit, setSavingEdit] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('items')
      .select('*')
      .order('name')
    if (fetchError) setError(fetchError.message)
    else setItems(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('items').insert({
      name: newItem.name,
      hsn_sac_code: newItem.hsn_sac_code,
      unit: newItem.unit,
      opening_stock: newItem.type === 'good' ? newItem.opening_stock || 0 : 0,
      low_stock_threshold: newItem.type === 'good' && newItem.low_stock_threshold !== '' ? newItem.low_stock_threshold : null,
      type: newItem.type,
      item_type: newItem.type === 'good' && newItem.item_type !== '' ? newItem.item_type : null,
      category: newItem.type === 'good' && newItem.category !== '' ? newItem.category : null,
      company_id: profile.company_id,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewItem(emptyItem)
    load()
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditItem({
      ...item,
      opening_stock: String(item.opening_stock),
      low_stock_threshold: item.low_stock_threshold == null ? '' : String(item.low_stock_threshold),
      item_type: item.item_type ?? '',
      category: item.category ?? '',
    })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('items')
      .update({
        name: editItem.name,
        hsn_sac_code: editItem.hsn_sac_code,
        unit: editItem.unit,
        opening_stock: editItem.type === 'good' ? editItem.opening_stock || 0 : 0,
        low_stock_threshold: editItem.type === 'good' && editItem.low_stock_threshold !== '' ? editItem.low_stock_threshold : null,
        type: editItem.type,
        item_type: editItem.type === 'good' && editItem.item_type !== '' ? editItem.item_type : null,
        category: editItem.type === 'good' && editItem.category !== '' ? editItem.category : null,
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

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete item "${item.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('items').delete().eq('id', item.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return

    setImportResult(null)
    setError(null)
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) throw new Error('CSV needs a header row plus at least one data row.')

      const header = rows[0].map((h) => h.trim().toLowerCase())
      const nameIdx = header.indexOf('name')
      const hsnIdx = header.indexOf('hsn_sac_code')
      const unitIdx = header.indexOf('unit')
      const typeIdx = header.indexOf('type')
      if (nameIdx === -1 || hsnIdx === -1 || unitIdx === -1 || typeIdx === -1) {
        throw new Error(`Header must include: ${CSV_COLUMNS.join(', ')} (required: name, hsn_sac_code, unit, type).`)
      }
      const openingIdx = header.indexOf('opening_stock')
      const thresholdIdx = header.indexOf('low_stock_threshold')
      const itemTypeIdx = header.indexOf('item_type')
      const categoryIdx = header.indexOf('category')

      const skipped = []
      const payload = []
      rows.slice(1).forEach((cols, i) => {
        const rowNum = i + 2 // account for header row, 1-indexed
        const name = cols[nameIdx]?.trim()
        const hsn = cols[hsnIdx]?.trim()
        const unit = cols[unitIdx]?.trim()
        const type = cols[typeIdx]?.trim()
        if (!name || !hsn || !unit || (type !== 'good' && type !== 'service')) {
          skipped.push(`Row ${rowNum}: missing name/hsn_sac_code/unit, or type isn't "good"/"service".`)
          return
        }
        const isGood = type === 'good'
        payload.push({
          company_id: profile.company_id,
          name,
          hsn_sac_code: hsn,
          unit,
          type,
          opening_stock: isGood && openingIdx !== -1 ? parseFloat(cols[openingIdx]) || 0 : 0,
          low_stock_threshold:
            isGood && thresholdIdx !== -1 && cols[thresholdIdx]?.trim() ? parseFloat(cols[thresholdIdx]) : null,
          item_type: isGood && itemTypeIdx !== -1 && cols[itemTypeIdx]?.trim() ? cols[itemTypeIdx].trim() : null,
          category: isGood && categoryIdx !== -1 && cols[categoryIdx]?.trim() ? cols[categoryIdx].trim() : null,
        })
      })

      if (payload.length === 0) {
        throw new Error('No valid rows to import.' + (skipped.length ? ' ' + skipped.join(' ') : ''))
      }

      const { error: insertError } = await supabase.from('items').insert(payload)
      if (insertError) throw new Error(insertError.message)

      setImportResult({ imported: payload.length, skipped })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Item Master</h1>
      <p className="mb-6 text-sm text-muted">Goods and services used on invoices.</p>

      {canEdit && (
        <div className="mb-6 rounded border border-slate-200 p-4">
          <p className="mb-2 text-sm font-medium text-ink">Bulk import from CSV</p>
          <p className="mb-2 text-sm text-muted">
            Header row required: <code>{CSV_COLUMNS.join(', ')}</code>. Only <code>name</code>, <code>hsn_sac_code</code>,{' '}
            <code>unit</code>, and <code>type</code> ("good" or "service") are required — the rest are optional and
            only apply to goods.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={handleImportFile} disabled={importing} className="text-sm" />
          {importing && <p className="mt-2 text-sm text-muted">Importing…</p>}
          {importResult && (
            <div className="mt-2 text-sm">
              <p className="text-green-700">Imported {importResult.imported} item(s).</p>
              {importResult.skipped.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-gold">
                  {importResult.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">HSN/SAC</th>
            <th className="py-2 pr-4">Unit</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Manufacturing</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Opening stock</th>
            <th className="py-2 pr-4">Low-stock alert</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              {editingId === item.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      value={editItem.name}
                      onChange={(e) => setEditItem((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editItem.hsn_sac_code}
                      onChange={(e) => setEditItem((f) => ({ ...f, hsn_sac_code: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editItem.unit}
                      onChange={(e) => setEditItem((f) => ({ ...f, unit: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editItem.type}
                      onChange={(e) => setEditItem((f) => ({ ...f, type: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      disabled={editItem.type !== 'good'}
                      value={editItem.type === 'good' ? editItem.item_type : ''}
                      onChange={(e) => setEditItem((f) => ({ ...f, item_type: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    >
                      {MANUFACTURING_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {MANUFACTURING_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      disabled={editItem.type !== 'good'}
                      placeholder="e.g. Milk-based"
                      value={editItem.type === 'good' ? editItem.category : ''}
                      onChange={(e) => setEditItem((f) => ({ ...f, category: e.target.value }))}
                      className="w-32 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={editItem.type !== 'good'}
                      value={editItem.type === 'good' ? editItem.opening_stock : '0'}
                      onChange={(e) => setEditItem((f) => ({ ...f, opening_stock: e.target.value }))}
                      className="w-24 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={editItem.type !== 'good'}
                      placeholder="none"
                      value={editItem.type === 'good' ? editItem.low_stock_threshold : ''}
                      onChange={(e) => setEditItem((f) => ({ ...f, low_stock_threshold: e.target.value }))}
                      className="w-24 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(item.id)}
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
                  <td className="py-2 pr-4">{item.name}</td>
                  <td className="py-2 pr-4">{item.hsn_sac_code}</td>
                  <td className="py-2 pr-4">{item.unit}</td>
                  <td className="py-2 pr-4 capitalize">{item.type}</td>
                  <td className="py-2 pr-4">{MANUFACTURING_TYPE_LABELS[item.item_type ?? '']}</td>
                  <td className="py-2 pr-4">{item.category || '—'}</td>
                  <td className="py-2 pr-4">{item.type === 'good' ? item.opening_stock : '—'}</td>
                  <td className="py-2 pr-4">{item.type === 'good' ? (item.low_stock_threshold ?? '—') : '—'}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(item)} className="text-sm text-ink hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(item)} className="text-sm text-clay hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={9} className="py-4 text-muted">
                No items yet.
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
              value={newItem.name}
              onChange={(e) => setNewItem((f) => ({ ...f, name: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">HSN/SAC code</span>
            <input
              required
              value={newItem.hsn_sac_code}
              onChange={(e) => setNewItem((f) => ({ ...f, hsn_sac_code: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Unit</span>
            <input
              required
              placeholder="e.g. Nos, Kg, Hrs"
              value={newItem.unit}
              onChange={(e) => setNewItem((f) => ({ ...f, unit: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Type</span>
            <select
              value={newItem.type}
              onChange={(e) => setNewItem((f) => ({ ...f, type: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {newItem.type === 'good' && (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Manufacturing</span>
                <select
                  value={newItem.item_type}
                  onChange={(e) => setNewItem((f) => ({ ...f, item_type: e.target.value }))}
                  className="rounded border border-slate-300 px-3 py-2"
                >
                  {MANUFACTURING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MANUFACTURING_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Category</span>
                <input
                  placeholder="e.g. Milk-based"
                  value={newItem.category}
                  onChange={(e) => setNewItem((f) => ({ ...f, category: e.target.value }))}
                  className="w-32 rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Opening stock</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.opening_stock}
                  onChange={(e) => setNewItem((f) => ({ ...f, opening_stock: e.target.value }))}
                  className="w-28 rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Low-stock alert</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="none"
                  value={newItem.low_stock_threshold}
                  onChange={(e) => setNewItem((f) => ({ ...f, low_stock_threshold: e.target.value }))}
                  className="w-28 rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add item'}
          </button>
        </form>
      )}
    </div>
  )
}
