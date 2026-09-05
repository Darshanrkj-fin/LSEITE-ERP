import { createClient } from '@supabase/supabase-js'
import { buildInvoicePdf } from '../../lib/invoicePdf.js'

// Same RLS-scoped fetch as functions/api/invoice-pdf.js (anon key + the
// caller's own forwarded token), plus sending the generated PDF as a Resend
// attachment — reusing the Resend integration already wired in for Phase
// 8's GST alerts, including its "from" address env var (it's a generic
// default sender, not actually GST-specific despite the name).

// btoa() only accepts a "binary string" (one char per byte) — chunked to
// avoid blowing the call stack on String.fromCharCode(...bytes) for a
// large PDF.
function bytesToBase64(bytes) {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// Cloudflare only calls onRequestPost for a POST — any other method falls
// through unmatched to static-asset/SPA-fallback serving instead of a
// clean error, so it needs its own explicit handler here (mirrors the
// original Vercel handler's `req.method !== 'POST'` check).
export function onRequestGet() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function onRequestPost(context) {
  const { request, env } = context
  const { invoiceId, toEmail } = await request.json().catch(() => ({}))
  if (!invoiceId || !toEmail) {
    return Response.json({ error: 'invoiceId and toEmail are required' }, { status: 400 })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  if (!env.RESEND_API_KEY) {
    return Response.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 })
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, parties(name, gstin, state_code)')
    .eq('id', invoiceId)
    .single()
  if (invoiceError || !invoice) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const { data: lineItems, error: lineError } = await supabase
    .from('invoice_line_items')
    .select('*, items(name)')
    .eq('invoice_id', invoiceId)
    .order('created_at')
  if (lineError) {
    return Response.json({ error: lineError.message }, { status: 500 })
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name, gstin, address, state_code, logo_url, udyam_number')
    .eq('id', invoice.company_id)
    .single()
  if (companyError || !company) {
    return Response.json({ error: 'Company not found' }, { status: 404 })
  }

  const pdfBytes = await buildInvoicePdf({ invoice, lineItems, company })
  const filename = `${invoice.invoice_number.replace(/\//g, '-')}.pdf`

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.GST_ALERT_FROM_EMAIL || 'onboarding@resend.dev',
      to: toEmail,
      subject: `${company.name}: ${invoice.invoice_number}`,
      text: `Please find attached invoice ${invoice.invoice_number}, dated ${invoice.invoice_date}, for ${invoice.grand_total}.`,
      attachments: [{ filename, content: bytesToBase64(pdfBytes) }],
    }),
  })

  if (!emailResponse.ok) {
    const body = await emailResponse.text().catch(() => '')
    return Response.json({ error: `Resend API error (HTTP ${emailResponse.status}): ${body}` }, { status: 502 })
  }

  return Response.json({ sent: true })
}
