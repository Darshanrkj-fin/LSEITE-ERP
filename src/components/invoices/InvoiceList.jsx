import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const LABELS = {
  sales: { title: 'Sales Invoices', party: 'Customer', new: 'New Sales Invoice' },
  purchase: { title: 'Purchase Invoices', party: 'Vendor', new: 'New Purchase Invoice' },
}

export function InvoiceList({ type, basePath }) {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'
  const labels = LABELS[type]

  const [invoices, setInvoices] = useState([])
  const [paymentStatus, setPaymentStatus] = useState({}) // invoice_id -> balance_due
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data, error: fetchError }, { data: statusRows }] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, status, grand_total, parties(name)')
          .eq('type', type)
          .order('invoice_date', { ascending: false })
          .order('invoice_number', { ascending: false }),
        supabase.from('invoice_payment_status').select('invoice_id, balance_due').eq('type', type),
      ])
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setInvoices(data)
      setPaymentStatus(Object.fromEntries((statusRows ?? []).map((r) => [r.invoice_id, r.balance_due])))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [type])

  // Display-only label layered on top of the real posted/cancelled state —
  // no due-date field exists yet, so there's no "Overdue" here (would need
  // a fabricated threshold); see ROADMAP.md Phase 29.
  const paymentLabel = (inv) => {
    if (inv.status !== 'posted') return null
    const balance = paymentStatus[inv.id]
    if (balance == null) return null
    if (balance <= 0.005) return 'Paid'
    if (balance < inv.grand_total - 0.005) return 'Partially Paid'
    return 'Unpaid'
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold font-display text-ink">{labels.title}</h1>
          <p className="text-sm text-muted">Invoices are immutable once posted — corrections go through cancellation.</p>
        </div>
        {canEdit && (
          <Link
            to={`${basePath}/new`}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {labels.new}
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Invoice #</th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">{labels.party}</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Grand Total</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                <Link to={`${basePath}/${inv.id}`} className="text-ink hover:underline">
                  {inv.invoice_number}
                </Link>
              </td>
              <td className="py-2 pr-4">{inv.invoice_date}</td>
              <td className="py-2 pr-4">{inv.parties?.name}</td>
              <td className="py-2 pr-4 capitalize">
                {inv.status}
                {paymentLabel(inv) && <span className="text-muted"> ({paymentLabel(inv)})</span>}
              </td>
              <td className="py-2 pr-4">{inv.grand_total}</td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted">
                No invoices yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
