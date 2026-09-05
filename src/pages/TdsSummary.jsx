import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'payment_date', label: 'Payment date' },
  { key: 'payee_name', label: 'Payee' },
  { key: 'section', label: 'Section' },
  { key: 'taxable_base', label: 'Base' },
  { key: 'rate', label: 'Rate (%)' },
  { key: 'tds_amount', label: 'TDS amount' },
  { key: 'deposited_on', label: 'Deposited on' },
]

export function TdsSummary() {
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
      const { data, error: fetchError } = await supabase.rpc('tds_summary', { p_from: from, p_to: to })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows((data ?? []).map((r) => ({ ...r, deposited_on: r.deposited_on || 'Not yet deposited' })))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [from, to])

  const total = rows.reduce((sum, r) => sum + Number(r.tds_amount), 0)

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">TDS Summary</h1>
      <p className="mb-6 text-sm text-muted">
        TDS deducted paying vendors, by payment date. Computed on the full payment amount — have your
        CA confirm whether any section's base should exclude the GST component before filing.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">To</span>
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
          onClick={() => downloadCsv(`tds-summary-${from}-to-${to}.csv`, COLUMNS, rows)}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          onClick={() =>
            downloadTablePdf({
              filename: `tds-summary-${from}-to-${to}.pdf`,
              title: 'TDS Summary',
              subtitle: `${from} to ${to}`,
              columns: COLUMNS,
              rows,
            })
          }
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download PDF
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-4">Payment date</th>
              <th className="py-2 pr-4">Payee</th>
              <th className="py-2 pr-4">Section</th>
              <th className="py-2 pr-4">Base</th>
              <th className="py-2 pr-4">Rate</th>
              <th className="py-2 pr-4">TDS amount</th>
              <th className="py-2 pr-4">Deposited on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.payment_date}</td>
                <td className="py-2 pr-4">{r.payee_name}</td>
                <td className="py-2 pr-4">{r.section}</td>
                <td className="py-2 pr-4">{r.taxable_base}</td>
                <td className="py-2 pr-4">{r.rate}%</td>
                <td className="py-2 pr-4">{r.tds_amount}</td>
                <td className="py-2 pr-4 text-muted">{r.deposited_on}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-muted">
                  No TDS deductions in this range.
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4" colSpan={5}>
                Total
              </td>
              <td className="py-2 pr-4">{total.toFixed(2)}</td>
              <td className="py-2 pr-4" />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
