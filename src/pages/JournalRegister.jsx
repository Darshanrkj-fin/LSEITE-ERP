import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'entry_date', label: 'Date' },
  { key: 'account_name', label: 'Account' },
  { key: 'reference_type', label: 'Reference' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
]

export function JournalRegister() {
  const [from, setFrom] = useState(thisFinancialYearRange().from)
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('journal_entries')
        .select('*, chart_of_accounts(name)')
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_date')
        .order('entry_group_id')
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows((data ?? []).map((r) => ({ ...r, account_name: r.chart_of_accounts?.name })))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [from, to])

  const totals = rows.reduce((acc, r) => ({ debit: acc.debit + Number(r.debit), credit: acc.credit + Number(r.credit) }), {
    debit: 0,
    credit: 0,
  })

  const handleDownloadCsv = () => downloadCsv(`journal-register-${from}-to-${to}.csv`, COLUMNS, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({
      filename: `journal-register-${from}-to-${to}.pdf`,
      title: 'Journal Register',
      subtitle: `${from} to ${to}`,
      columns: COLUMNS,
      rows,
    })

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Journal Register</h1>
      <p className="mb-6 text-sm text-slate-500">Every journal entry leg across the whole company, in date order.</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <button
          type="button"
          onClick={() => { const r = thisFinancialYearRange(); setFrom(r.from); setTo(r.to) }}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          This FY
        </button>
        <button
          type="button"
          onClick={() => { const r = lastFinancialYearRange(); setFrom(r.from); setTo(r.to) }}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Last FY
        </button>
        <button
          onClick={handleDownloadCsv}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download PDF
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              {COLUMNS.map((c) => (
                <th key={c.key} className="py-2 pr-4">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.entry_date}</td>
                <td className="py-2 pr-4">{r.account_name}</td>
                <td className="py-2 pr-4 capitalize">{r.reference_type}</td>
                <td className="py-2 pr-4">{r.debit > 0 ? r.debit : ''}</td>
                <td className="py-2 pr-4">{r.credit > 0 ? r.credit : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-slate-400">
                  No entries in this period.
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4" colSpan={3}>
                Total
              </td>
              <td className="py-2 pr-4">{totals.debit.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.credit.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
