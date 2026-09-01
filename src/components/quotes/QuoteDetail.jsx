import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const NEXT_STATUS_ACTIONS = {
  draft: [{ status: 'sent', label: 'Mark as Sent' }],
  sent: [
    { status: 'accepted', label: 'Mark as Accepted' },
    { status: 'rejected', label: 'Mark as Rejected' },
  ],
}

export function QuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [quote, setQuote] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [convertAccountId, setConvertAccountId] = useState('')
  const [showConvert, setShowConvert] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [converting, setConverting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: q, error: qError }, { data: lines, error: lineError }, { data: accountRows }] = await Promise.all([
      supabase.from('quotes').select('*, parties(name, gstin, state_code)').eq('id', id).single(),
      supabase.from('quote_line_items').select('*, items(name)').eq('quote_id', id).order('id'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'income'),
    ])
    if (qError) setError(qError.message)
    else setQuote(q)
    if (lineError) setError(lineError.message)
    else setLineItems(lines ?? [])
    setAccounts(accountRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [id])

  const handleStatusChange = async (newStatus) => {
    setError(null)
    setUpdatingStatus(true)
    const { error: statusError } = await supabase.rpc('update_quote_status', {
      p_quote_id: id,
      p_new_status: newStatus,
    })
    setUpdatingStatus(false)
    if (statusError) {
      setError(statusError.message)
      return
    }
    load()
  }

  const handleConvert = async () => {
    if (!convertAccountId) {
      setError('Select a revenue account to convert this quote.')
      return
    }
    setError(null)
    setConverting(true)
    const { data, error: convertError } = await supabase.rpc('convert_quote_to_invoice', {
      p_quote_id: id,
      p_revenue_expense_account_id: convertAccountId,
    })
    setConverting(false)
    if (convertError) {
      setError(convertError.message)
      return
    }
    navigate(`/sales-invoices/${data.id}`)
  }

  const handleDownloadPdf = async () => {
    setError(null)
    setDownloading(true)
    try {
      const response = await fetch(`/api/quote-pdf?id=${id}`, {
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
      a.download = `${quote.quote_number.replace(/\//g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>
  if (error && !quote) return <p className="text-sm text-red-600">{error}</p>

  const nextActions = canEdit ? NEXT_STATUS_ACTIONS[quote.status] ?? [] : []

  return (
    <div className="max-w-3xl">
      <Link to="/quotes" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Back
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{quote.quote_number}</h1>
          <p className="text-sm text-slate-500">
            Customer: {quote.parties?.name} · {quote.quote_date} · <span className="capitalize">{quote.status}</span>
            {quote.valid_until && <> · Valid until {quote.valid_until}</>}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          {nextActions.map((action) => (
            <button
              key={action.status}
              onClick={() => handleStatusChange(action.status)}
              disabled={updatingStatus}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {updatingStatus ? 'Working…' : action.label}
            </button>
          ))}
          {canEdit && quote.status === 'accepted' && (
            <button
              onClick={() => setShowConvert((v) => !v)}
              className="rounded bg-slate-800 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700"
            >
              Convert to Invoice
            </button>
          )}
        </div>
      </div>

      {showConvert && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-slate-200 p-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Revenue account</span>
            <select
              value={convertAccountId}
              onChange={(e) => setConvertAccountId(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleConvert}
            disabled={converting || !convertAccountId}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {converting ? 'Converting…' : 'Confirm Conversion'}
          </button>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {quote.status === 'converted' && (
        <p className="mb-4 text-sm text-slate-600">
          Converted to invoice{' '}
          <Link to={`/sales-invoices/${quote.converted_invoice_id}`} className="text-slate-800 hover:underline">
            view invoice
          </Link>
          .
        </p>
      )}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
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
              <td className="py-1 pr-4 text-slate-500">Subtotal</td>
              <td className="py-1 text-right">{quote.subtotal}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-slate-500">CGST</td>
              <td className="py-1 text-right">{quote.cgst_total}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-slate-500">SGST</td>
              <td className="py-1 text-right">{quote.sgst_total}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-slate-500">IGST</td>
              <td className="py-1 text-right">{quote.igst_total}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-1 pr-4">Grand total</td>
              <td className="py-1 text-right">{quote.grand_total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
