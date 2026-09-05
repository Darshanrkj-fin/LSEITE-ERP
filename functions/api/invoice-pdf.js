import { createClient } from '@supabase/supabase-js'
import { buildInvoicePdf } from '../../lib/invoicePdf.js'

// Uses the anon key + the caller's own access token (forwarded from the
// browser's Supabase session), never the service-role key — RLS applies
// exactly as it would for the logged-in user, so this endpoint can never
// see another company's invoice.
export async function onRequestGet(context) {
  const { request, env } = context
  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Missing invoice id' }, { status: 400 })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, parties(name, gstin, state_code)')
    .eq('id', id)
    .single()
  if (invoiceError || !invoice) {
    return Response.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const { data: lineItems, error: lineError } = await supabase
    .from('invoice_line_items')
    .select('*, items(name)')
    .eq('invoice_id', id)
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

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoice_number.replace(/\//g, '-')}.pdf"`,
    },
  })
}
