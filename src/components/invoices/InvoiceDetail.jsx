import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { PaymentsSection } from './PaymentsSection'

const LABELS = {
  sales: { party: 'Customer', noteAction: 'Issue Credit Note', noteDoc: 'credit note' },
  purchase: { party: 'Vendor', noteAction: 'Issue Debit Note', noteDoc: 'debit note' },
}

export function InvoiceDetail({ type, basePath }) {
  const { id } = useParams()
  const { profile, session } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'
  const labels = LABELS[type]

  const [invoice, setInvoice] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [creditNote, setCreditNote] = useState(null)
  const [applicableAdvance, setApplicableAdvance] = useState(null)
  const [applyingAdvance, setApplyingAdvance] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: inv, error: invError }, { data: lines, error: lineError }, { data: note }] = await Promise.all([
      supabase.from('invoices').select('*, parties(name, email)').eq('id', id).single(),
      supabase
        .from('invoice_line_items')
        .select('*, items(name)')
        .eq('invoice_id', id)
        .order('created_at'),
      supabase.from('credit_notes').select('*').eq('invoice_id', id).maybeSingle(),
    ])
    if (invError) setError(invError.message)
    else {
      setInvoice(inv)
      setEmailTo((current) => current || inv.parties?.email || '')
    }
    if (lineError) setError(lineError.message)
    else setLineItems(lines ?? [])
    setCreditNote(note ?? null)

    // An unapplied advance on this invoice's custom order, if any — the
    // "selectable credit when raising the final invoice" from ROADMAP.md's
    // Phase 23. Only meaningful for a posted sales invoice tied to a
    // custom order; apply_advance_to_invoice() re-validates everything
    // server-side regardless.
    if (inv && !invError && type === 'sales' && inv.custom_order_id) {
      const { data: advance } = await supabase
        .from('customer_advances')
        .select('id, amount, advance_date')
        .eq('custom_order_id', inv.custom_order_id)
        .eq('party_id', inv.party_id)
        .eq('status', 'unapplied')
        .maybeSingle()
      setApplicableAdvance(advance ?? null)
    } else {
      setApplicableAdvance(null)
    }

    setLoading(false)
  }

  const handleApplyAdvance = async () => {
    if (!window.confirm(`Apply advance of ${applicableAdvance.amount} to this invoice?`)) return
    setError(null)
    setApplyingAdvance(true)
    const { error: applyError } = await supabase.rpc('apply_advance_to_invoice', {
      p_advance_id: applicableAdvance.id,
      p_invoice_id: id,
    })
    setApplyingAdvance(false)
    if (applyError) {
      setError(applyError.message)
      return
    }
    load()
  }

  useEffect(() => {
    load()
  }, [id])

  const handleCancel = async () => {
    if (
      !window.confirm(
        `Issue a ${labels.noteDoc} for ${invoice.invoice_number}? This posts a reversing ledger entry dated today and cannot be undone.`
      )
    )
      return
    setError(null)
    setCancelling(true)
    const { error: cancelError } = await supabase.rpc('cancel_invoice', { p_invoice_id: id })
    setCancelling(false)
    if (cancelError) {
      setError(cancelError.message)
      return
    }
    load()
  }

  const handleDownloadPdf = async () => {
    setError(null)
    setDownloading(true)
    try {
      const response = await fetch(`/api/invoice-pdf?id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to generate PDF (HTTP ${response.status})`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoice.invoice_number.replace(/\//g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  const handleEmailPdf = async () => {
    setError(null)
    setEmailSent(false)
    setEmailing(true)
    try {
      const response = await fetch('/api/email-invoice-pdf', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceId: id, toEmail: emailTo }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error ?? `Failed to email PDF (HTTP ${response.status})`)
      }
      setEmailSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setEmailing(false)
    }
  }

  if (loading) return <p className="text-muted">Loading…</p>
  if (error && !invoice) return <p className="text-sm text-clay">{error}</p>

  return (
    <div className="max-w-3xl">
      <Link to={basePath} className="mb-4 inline-block text-sm text-muted hover:underline">
        ← Back
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold font-display text-ink">{invoice.invoice_number}</h1>
          <p className="text-sm text-muted">
            {labels.party}: {invoice.parties?.name} · {invoice.invoice_date} ·{' '}
            <span className="capitalize">{invoice.status}</span>
          </p>
          {creditNote && (
            <p className="text-sm text-clay">
              Credited via {creditNote.note_number} on {creditNote.note_date}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          <button
            onClick={() => {
              setShowEmailForm((v) => !v)
              setEmailSent(false)
            }}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Email PDF
          </button>
          {canEdit && invoice.status === 'posted' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded border border-red-300 px-3 py-1 text-sm text-clay hover:bg-red-50 disabled:opacity-50"
            >
              {cancelling ? 'Working…' : labels.noteAction}
            </button>
          )}
        </div>
      </div>

      {showEmailForm && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-slate-200 p-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Send PDF to</span>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="recipient@example.com"
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            onClick={handleEmailPdf}
            disabled={emailing || !emailTo}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {emailing ? 'Sending…' : 'Send'}
          </button>
          {emailSent && <p className="text-sm text-green-600">Sent.</p>}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">HSN/SAC</th>
            <th className="py-2 pr-4">Qty</th>
            <th className="py-2 pr-4">Rate</th>
            <th className="py-2 pr-4">Taxable</th>
            <th className="py-2 pr-4">CGST</th>
            <th className="py-2 pr-4">SGST</th>
            <th className="py-2 pr-4">IGST</th>
            <th className="py-2 pr-4">Line total</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li) => (
            <tr key={li.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{li.items?.name}</td>
              <td className="py-2 pr-4">{li.hsn_sac_code}</td>
              <td className="py-2 pr-4">{li.quantity}</td>
              <td className="py-2 pr-4">{li.rate}</td>
              <td className="py-2 pr-4">{li.taxable_value}</td>
              <td className="py-2 pr-4">{li.cgst_amount}</td>
              <td className="py-2 pr-4">{li.sgst_amount}</td>
              <td className="py-2 pr-4">{li.igst_amount}</td>
              <td className="py-2 pr-4">{li.line_total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="py-1 pr-4 text-muted">Subtotal</td>
              <td className="py-1 text-right">{invoice.subtotal}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-muted">CGST</td>
              <td className="py-1 text-right">{invoice.cgst_total}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-muted">SGST</td>
              <td className="py-1 text-right">{invoice.sgst_total}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-muted">IGST</td>
              <td className="py-1 text-right">{invoice.igst_total}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-1 pr-4">Grand total</td>
              <td className="py-1 text-right">{invoice.grand_total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {canEdit && applicableAdvance && (
        <div className="mb-4 flex items-center justify-between rounded border border-slate-200 p-3">
          <p className="text-sm text-slate-600">
            An unapplied advance of {applicableAdvance.amount} from {applicableAdvance.advance_date} is available for
            this custom order.
          </p>
          <button
            onClick={handleApplyAdvance}
            disabled={applyingAdvance}
            className="rounded bg-ink px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {applyingAdvance ? 'Applying…' : 'Apply Advance'}
          </button>
        </div>
      )}

      <PaymentsSection invoice={invoice} />
    </div>
  )
}
