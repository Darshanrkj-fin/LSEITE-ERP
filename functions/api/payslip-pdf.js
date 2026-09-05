import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Same pattern as invoice-pdf.js: anon key + the caller's own access
// token, never the service-role key — RLS applies exactly as it would
// for the logged-in user, so this can never see another company's payslip.
export async function onRequestGet(context) {
  const { request, env } = context
  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Missing payroll run id' }, { status: 400 })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .select('*, employees(name, employee_code)')
    .eq('id', id)
    .single()
  if (runError || !run) {
    return Response.json({ error: 'Payroll run not found' }, { status: 404 })
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name, address')
    .eq('id', run.company_id)
    .single()
  if (companyError || !company) {
    return Response.json({ error: 'Company not found' }, { status: 404 })
  }

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const left = 40
  let y = 800

  const text = (s, x, size, useBold) =>
    page.drawText(String(s ?? ''), { x, y, size, font: useBold ? bold : font, color: rgb(0, 0, 0) })

  text(company.name, left, 16, true)
  y -= 20
  if (company.address) {
    text(company.address, left, 10)
    y -= 14
  }
  y -= 8

  text('PAYSLIP', left, 13, true)
  y -= 18
  text(`Month: ${run.run_month}`, left, 10)
  y -= 14
  text(`Employee: ${run.employees?.name}${run.employees?.employee_code ? ` (${run.employees.employee_code})` : ''}`, left, 10)
  y -= 24

  const labelX = left
  const valueX = left + 220
  const row = (label, value, useBold) => {
    text(label, labelX, 10, useBold)
    text(value, valueX, 10, useBold)
    y -= 16
  }

  row('Gross salary', run.gross_salary, true)
  y -= 6
  row('PF deduction', run.pf_deduction)
  row('ESI deduction', run.esi_deduction)
  row('Professional tax', run.professional_tax_deduction)
  row('Other deductions', run.other_deductions)
  row('Total deductions', run.total_deductions, true)
  y -= 6
  row('Net pay', run.net_pay, true)

  const pdfBytes = await pdfDoc.save()

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${run.run_month}-${run.employees?.name ?? id}.pdf"`,
    },
  })
}
