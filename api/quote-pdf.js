import { createClient } from '@supabase/supabase-js'
import { buildInvoicePdf } from '../lib/invoicePdf.js'

// Same pattern as api/invoice-pdf.js: anon key + the caller's own access
// token, never the service-role key — RLS applies exactly as it would for
// the logged-in user.
export default async function handler(req, res) {
  const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id')
  if (!id) {
    res.status(400).json({ error: 'Missing quote id' })
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

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*, parties(name, gstin, state_code)')
    .eq('id', id)
    .single()
  if (quoteError || !quote) {
    res.status(404).json({ error: 'Quote not found' })
    return
  }

  const { data: lineItems, error: lineError } = await supabase
    .from('quote_line_items')
    .select('*, items(name)')
    .eq('quote_id', id)
    .order('id')
  if (lineError) {
    res.status(500).json({ error: lineError.message })
    return
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name, gstin, address, state_code, logo_url, udyam_number')
    .eq('id', quote.company_id)
    .single()
  if (companyError || !company) {
    res.status(404).json({ error: 'Company not found' })
    return
  }

  const pdfBytes = await buildInvoicePdf({
    invoice: { ...quote, type: 'sales', invoice_number: quote.quote_number },
    lineItems,
    company,
    heading: 'QUOTATION',
    numberLabel: 'Quote #',
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${quote.quote_number.replace(/\//g, '-')}.pdf"`)
  res.status(200).send(Buffer.from(pdfBytes))
}
