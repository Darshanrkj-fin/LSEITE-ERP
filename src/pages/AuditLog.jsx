import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const TABLES = ['items', 'parties', 'tax_rates', 'chart_of_accounts']

export function AuditLog() {
  const [rows, setRows] = useState([])
  const [tableFilter, setTableFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let query = supabase
        .from('audit_log')
        .select('*, users(full_name)')
        .order('changed_at', { ascending: false })
        .limit(200)
      if (tableFilter) query = query.eq('table_name', tableFilter)
      const { data, error: fetchError } = await query
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [tableFilter])

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Audit Log</h1>
      <p className="mb-6 text-sm text-slate-500">
        Every insert, update, and delete on master data (items, parties, tax rates, chart of accounts) — most recent
        200 entries. Financial postings (invoices, payments, payroll) aren't here since they're never edited or
        deleted in the first place — they're always reversed with a new dated entry instead.
      </p>

      <div className="mb-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Table</span>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="">All</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Time</th>
            <th className="py-2 pr-4">Table</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Changed by</th>
            <th className="py-2 pr-4">Before</th>
            <th className="py-2 pr-4">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.changed_at).toLocaleString()}</td>
              <td className="py-2 pr-4">{r.table_name}</td>
              <td className="py-2 pr-4 capitalize">{r.action}</td>
              <td className="py-2 pr-4">{r.users?.full_name ?? '—'}</td>
              <td className="max-w-xs py-2 pr-4 font-mono text-xs break-all text-slate-500">
                {r.old_values ? JSON.stringify(r.old_values) : '—'}
              </td>
              <td className="max-w-xs py-2 pr-4 font-mono text-xs break-all text-slate-500">
                {r.new_values ? JSON.stringify(r.new_values) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-slate-400">
                No changes logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
