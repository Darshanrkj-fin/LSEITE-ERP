import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'label', label: '' },
  { key: 'taxable_value', label: 'Taxable value' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'igst', label: 'IGST' },
]

export function GstSummary() {
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
      const { data, error: fetchError } = await supabase.rpc('gstr3b_summary', { p_from: from, p_to: to })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [from, to])

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">GST Summary (GSTR-3B style)</h1>
      <p className="mb-2 text-sm text-slate-500">
        Outward taxable supplies and inward supplies eligible for input tax credit, for manual filing — not a filed
        return. Supplies are counted in the period they were invoiced, not affected by a later cancellation — that
        instead shows up as its own "less: credit/debit notes" line, dated when the note was actually issued.
      </p>
      <p className="mb-6 text-sm text-amber-700">
        This deliberately stops short of a final "net tax payable" figure. Offsetting input tax credit against
        output liability (e.g. IGST credit must apply to IGST liability before CGST/SGST) follows government rules
        that can change — have your CA apply that set-off to the raw figures below before filing.
      </p>

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
          onClick={() => downloadCsv(`gst-summary-${from}-to-${to}.csv`, COLUMNS, rows)}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          onClick={() =>
            downloadTablePdf({
              filename: `gst-summary-${from}-to-${to}.pdf`,
              title: 'GST Summary (GSTR-3B style)',
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

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4"></th>
              <th className="py-2 pr-4">Taxable value</th>
              <th className="py-2 pr-4">CGST</th>
              <th className="py-2 pr-4">SGST</th>
              <th className="py-2 pr-4">IGST</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.label}</td>
                <td className="py-2 pr-4">{r.taxable_value}</td>
                <td className="py-2 pr-4">{r.cgst}</td>
                <td className="py-2 pr-4">{r.sgst}</td>
                <td className="py-2 pr-4">{r.igst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
