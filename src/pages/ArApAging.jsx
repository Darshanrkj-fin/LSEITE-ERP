import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'invoice_number', label: 'Invoice #' },
  { key: 'party_name', label: 'Party' },
  { key: 'invoice_date', label: 'Invoice date' },
  { key: 'grand_total', label: 'Invoice total' },
  { key: 'balance_due', label: 'Balance due' },
  { key: 'days_outstanding', label: 'Days outstanding' },
  { key: 'bucket', label: 'Bucket' },
]

const BUCKET_ORDER = ['Current (0-30)', '31-60', '61-90', '90+']

// Buckets are by days since invoice_date, not a formal due date — this
// app doesn't track payment terms yet, so "Current" means the invoice
// itself is 0-30 days old, not "not yet due" (see schema.sql comment on
// ar_ap_aging()).
export function ArApAging() {
  const [type, setType] = useState('sales')
  const [asOf, setAsOf] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase.rpc('ar_ap_aging', { p_type: type, p_as_of: asOf })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [type, asOf])

  const totalBalance = rows.reduce((sum, r) => sum + r.balance_due, 0)
  const bucketTotals = BUCKET_ORDER.map((bucket) => ({
    bucket,
    total: rows.filter((r) => r.bucket === bucket).reduce((sum, r) => sum + r.balance_due, 0),
  }))

  const label = type === 'sales' ? 'Receivable (AR)' : 'Payable (AP)'
  const handleDownloadCsv = () => downloadCsv(`${type}-aging-${asOf}.csv`, COLUMNS, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({
      filename: `${type}-aging-${asOf}.pdf`,
      title: `Accounts ${label} Aging`,
      subtitle: `As of ${asOf}`,
      columns: COLUMNS,
      rows,
    })

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">AR/AP Aging</h1>
      <p className="mb-6 text-sm text-muted">
        Outstanding balance on posted invoices, bucketed by days since the invoice date.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            <option value="sales">Receivable (customers)</option>
            <option value="purchase">Payable (vendors)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">As of</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button onClick={handleDownloadCsv} disabled={rows.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download CSV
        </button>
        <button onClick={handleDownloadPdf} disabled={rows.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download PDF
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            {bucketTotals.map((b) => (
              <div key={b.bucket} className="rounded border border-line bg-mist px-3 py-2">
                <div className="text-muted">{b.bucket}</div>
                <div className="font-semibold text-ink">{b.total.toFixed(2)}</div>
              </div>
            ))}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-muted">
                <th className="py-2 pr-4">Invoice #</th>
                <th className="py-2 pr-4">Party</th>
                <th className="py-2 pr-4">Invoice date</th>
                <th className="py-2 pr-4">Invoice total</th>
                <th className="py-2 pr-4">Balance due</th>
                <th className="py-2 pr-4">Days</th>
                <th className="py-2 pr-4">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.invoice_id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.invoice_number}</td>
                  <td className="py-2 pr-4">{r.party_name}</td>
                  <td className="py-2 pr-4">{r.invoice_date}</td>
                  <td className="py-2 pr-4">{r.grand_total}</td>
                  <td className="py-2 pr-4">{r.balance_due}</td>
                  <td className="py-2 pr-4">{r.days_outstanding}</td>
                  <td className="py-2 pr-4">{r.bucket}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-muted">
                    Nothing outstanding.
                  </td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="py-2 pr-4" colSpan={4}>
                  Total
                </td>
                <td className="py-2 pr-4">{totalBalance.toFixed(2)}</td>
                <td className="py-2 pr-4" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
