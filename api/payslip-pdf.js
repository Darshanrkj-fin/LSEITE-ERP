import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Same pattern as invoice-pdf.js: anon key + the caller's own access
// token, never the service-role key — RLS applies exactly as it would
// for the logged-in user, so this can never see another company's payslip.
export default async function handler(req, res) {
  const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id')
  if (!id) {
    res.status(400).json({ error: 'Missing payroll run id' })
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

  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .select('*, employees(name, employee_code)')
    .eq('id', id)
    .single()
  if (runError || !run) {
    res.status(404).json({ error: 'Payroll run not found' })
    return
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name, address')
    .eq('id', run.company_id)
    .single()
  if (companyError || !company) {
    res.status(404).json({ error: 'Company not found' })
    return
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

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${run.run_month}-${run.employees?.name ?? id}.pdf"`)
  res.status(200).send(Buffer.from(pdfBytes))
}
