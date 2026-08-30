import { createClient } from '@supabase/supabase-js'
import { buildInvoicePdf } from '../lib/invoicePdf.js'

// Uses the anon key + the caller's own access token (forwarded from the
// browser's Supabase session), never the service-role key — RLS applies
// exactly as it would for the logged-in user, so this endpoint can never
// see another company's invoice.
export default async function handler(req, res) {
  const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id')
  if (!id) {
    res.status(400).json({ error: 'Missing invoice id' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' })
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
    .eq('id', id)
    .single()
  if (invoiceError || !invoice) {
    res.status(404).json({ error: 'Invoice not found' })
    return
  }

  const { data: lineItems, error: lineError } = await supabase
    .from('invoice_line_items')
    .select('*, items(name)')
    .eq('invoice_id', id)
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

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number.replace(/\//g, '-')}.pdf"`)
  res.status(200).send(Buffer.from(pdfBytes))
}
