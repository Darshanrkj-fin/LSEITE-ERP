import { createClient } from '@supabase/supabase-js'
import { buildInvoicePdf } from '../lib/invoicePdf.js'

// Same RLS-scoped fetch as api/invoice-pdf.js (anon key + the caller's own
// forwarded token), plus sending the generated PDF as a Resend attachment
// — reusing the Resend integration already wired in for Phase 8's GST
// alerts, including its "from" address env var (it's a generic default
// sender, not actually GST-specific despite the name).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { invoiceId, toEmail } = req.body ?? {}
  if (!invoiceId || !toEmail) {
    res.status(400).json({ error: 'invoiceId and toEmail are required' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return
  }

  if (!process.env.RESEND_API_KEY) {
    res.status(500).json({ error: 'RESEND_API_KEY is not configured' })
    return
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, parties(name, gstin, state_code)')
    .eq('id', invoiceId)
    .single()
  if (invoiceError || !invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const { data: lineItems, error: lineError } = await supabase
    .from('invoice_line_items')
    .select('*, items(name)')
    .eq('invoice_id', invoiceId)
    .order('created_at')
  if (lineError) {
    res.status(500).json({ error: lineError.message })
    return
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name, gstin, address, state_code, logo_url, udyam_number')
    .eq('id', invoice.company_id)
    .single()
  if (companyError || !company) {
    res.status(404).json({ error: 'Company not found' })
    return
  }

  const pdfBytes = await buildInvoicePdf({ invoice, lineItems, company })
  const filename = `${invoice.invoice_number.replace(/\//g, '-')}.pdf`

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.GST_ALERT_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: `${company.name}: ${invoice.invoice_number}`,
      text: `Please find attached invoice ${invoice.invoice_number}, dated ${invoice.invoice_date}, for ${invoice.grand_total}.`,
      attachments: [{ filename, content: Buffer.from(pdfBytes).toString('base64') }],
    }),
  })

  if (!emailResponse.ok) {
    const body = await emailResponse.text().catch(() => '')
    res.status(502).json({ error: `Resend API error (HTTP ${emailResponse.status}): ${body}` })
    return
  }

  res.status(200).json({ sent: true })
}
