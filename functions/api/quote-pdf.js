import { createClient } from '@supabase/supabase-js'
import { buildInvoicePdf } from '../../lib/invoicePdf.js'

// Same pattern as functions/api/invoice-pdf.js: anon key + the caller's own
// access token, never the service-role key — RLS applies exactly as it
// would for the logged-in user.
export async function onRequestGet(context) {
  const { request, env } = context
  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Missing quote id' }, { status: 400 })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*, parties(name, gstin, state_code)')
    .eq('id', id)
    .single()
  if (quoteError || !quote) {
    return Response.json({ error: 'Quote not found' }, { status: 404 })
  }

  const { data: lineItems, error: lineError } = await supabase
    .from('quote_line_items')
    .select('*, items(name)')
    .eq('quote_id', id)
    .order('id')
  if (lineError) {
    return Response.json({ error: lineError.message }, { status: 500 })
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name, gstin, address, state_code, logo_url, udyam_number')
    .eq('id', quote.company_id)
    .single()
  if (companyError || !company) {
    return Response.json({ error: 'Company not found' }, { status: 404 })
  }

  const pdfBytes = await buildInvoicePdf({
    invoice: { ...quote, type: 'sales', invoice_number: quote.quote_number },
    lineItems,
    company,
    heading: 'QUOTATION',
    numberLabel: 'Quote #',
  })

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quote.quote_number.replace(/\//g, '-')}.pdf"`,
    },
  })
}
