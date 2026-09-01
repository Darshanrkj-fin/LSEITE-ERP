import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { thisFinancialYearRange, lastFinancialYearRange } from '../lib/financialYear'

const today = () => new Date().toISOString().slice(0, 10)

function toCsv(rows) {
  const header = ['Document #', 'Date', 'Customer', 'GSTIN', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total']
  const lines = rows.map((r) => [
    r.number,
    r.date,
    r.partyName ?? '',
    r.partyGstin ?? '',
    r.subtotal,
    r.cgst,
    r.sgst,
    r.igst,
    r.total,
  ])
  return [header, ...lines].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function SalesRegister() {
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

      // Invoices are included regardless of later cancellation — a supply
      // dated in this period genuinely happened in this period. The
      // correction shows up separately below, dated when it was actually
      // issued (see credit_notes), never by silently removing the invoice
      // from a period that may already be filed.
      const [{ data: invoices, error: invError }, { data: notes, error: noteError }] = await Promise.all([
        supabase
          .from('invoices')
          .select('*, parties(name, gstin, state_code)')
          .eq('type', 'sales')
          .gte('invoice_date', from)
          .lte('invoice_date', to)
          .order('invoice_date'),
        supabase
          .from('credit_notes')
          .select('*, invoices(invoice_number, parties(name, gstin))')
          .eq('type', 'sales')
          .gte('note_date', from)
          .lte('note_date', to)
          .order('note_date'),
      ])

      if (cancelled) return
      if (invError) setError(invError.message)
      if (noteError) setError(noteError.message)

      const invoiceRows = (invoices ?? []).map((i) => ({
        kind: 'invoice',
        key: i.id,
        number: i.invoice_number,
        date: i.invoice_date,
        partyName: i.parties?.name,
        partyGstin: i.parties?.gstin,
        subtotal: i.subtotal,
        cgst: i.cgst_total,
        sgst: i.sgst_total,
        igst: i.igst_total,
        total: i.grand_total,
      }))
      const noteRows = (notes ?? []).map((n) => ({
        kind: 'credit_note',
        key: n.id,
        number: n.note_number,
        date: n.note_date,
        partyName: n.invoices?.parties?.name,
        partyGstin: n.invoices?.parties?.gstin,
        against: n.invoices?.invoice_number,
        subtotal: -n.subtotal,
        cgst: -n.cgst_total,
        sgst: -n.sgst_total,
        igst: -n.igst_total,
        total: -n.grand_total,
      }))

      setRows([...invoiceRows, ...noteRows].sort((a, b) => a.date.localeCompare(b.date)))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [from, to])

  const totals = rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotal,
      cgst: acc.cgst + r.cgst,
      sgst: acc.sgst + r.sgst,
      igst: acc.igst + r.igst,
      grand: acc.grand + r.total,
    }),
    { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 }
  )

  const handleDownload = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-register-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Sales Register (GSTR-1 style)</h1>
      <p className="mb-6 text-sm text-muted">
        Every sales invoice dated in this period, plus any credit note actually issued in this period (against an
        invoice from any period) — for manual entry into the GST portal or your CA's filing tool. Not a filed
        return; nothing is submitted anywhere automatically. An invoice keeps its original figures here even if it's
        cancelled later — the correction always appears as its own dated credit note instead, so a period you've
        already filed never silently changes.
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
          onClick={() => {
            const r = thisFinancialYearRange()
            setFrom(r.from)
            setTo(r.to)
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          This FY
        </button>
        <button
          type="button"
          onClick={() => {
            const r = lastFinancialYearRange()
            setFrom(r.from)
            setTo(r.to)
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Last FY
        </button>
        <button
          onClick={handleDownload}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download CSV
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-4">Document #</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">GSTIN</th>
              <th className="py-2 pr-4">Taxable</th>
              <th className="py-2 pr-4">CGST</th>
              <th className="py-2 pr-4">SGST</th>
              <th className="py-2 pr-4">IGST</th>
              <th className="py-2 pr-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-slate-100 ${r.kind === 'credit_note' ? 'text-clay' : ''}`}>
                <td className="py-2 pr-4">
                  {r.number}
                  {r.kind === 'credit_note' && <span className="text-muted"> (against {r.against})</span>}
                </td>
                <td className="py-2 pr-4">{r.date}</td>
                <td className="py-2 pr-4">{r.partyName}</td>
                <td className="py-2 pr-4">{r.partyGstin || '—'}</td>
                <td className="py-2 pr-4">{r.subtotal}</td>
                <td className="py-2 pr-4">{r.cgst}</td>
                <td className="py-2 pr-4">{r.sgst}</td>
                <td className="py-2 pr-4">{r.igst}</td>
                <td className="py-2 pr-4">{r.total}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-muted">
                  No sales documents in this period.
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4" colSpan={4}>
                Total
              </td>
              <td className="py-2 pr-4">{totals.subtotal.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.cgst.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.sgst.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.igst.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.grand.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
