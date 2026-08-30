import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Shared by api/invoice-pdf.js (download) and api/email-invoice-pdf.js
// (email attachment) so the two never drift out of sync. company must
// include logo_url/udyam_number if you want them printed — both optional.
export async function buildInvoicePdf({ invoice, lineItems, company }) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const left = 40
  let y = 800

  const text = (s, x, size, useBold) =>
    page.drawText(String(s ?? ''), { x, y, size, font: useBold ? bold : font, color: rgb(0, 0, 0) })

  // Logo, if set — drawn in the top-right corner. Best-effort: a bad URL
  // or unsupported format just skips the logo rather than failing the
  // whole PDF, since this is cosmetic polish, not a correctness feature.
  if (company.logo_url) {
    try {
      const logoResponse = await fetch(company.logo_url)
      if (logoResponse.ok) {
        const contentType = logoResponse.headers.get('content-type') ?? ''
        const bytes = new Uint8Array(await logoResponse.arrayBuffer())
        const image = contentType.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
        const maxDim = 60
        const scale = Math.min(maxDim / image.width, maxDim / image.height, 1)
        page.drawImage(image, {
          x: 595.28 - 40 - image.width * scale,
          y: 841.89 - 40 - image.height * scale,
          width: image.width * scale,
          height: image.height * scale,
        })
      }
    } catch {
      // ignore — logo is cosmetic, never blocks invoice generation
    }
  }

  text(company.name, left, 16, true)
  y -= 20
  if (company.gstin) {
    text(`GSTIN: ${company.gstin}`, left, 10)
    y -= 14
  }
  if (company.address) {
    text(company.address, left, 10)
    y -= 14
  }
  if (company.udyam_number) {
    text(`Udyam Reg. No.: ${company.udyam_number}`, left, 10)
    y -= 14
  }
  y -= 8

  text(invoice.type === 'sales' ? 'TAX INVOICE (Sales)' : 'PURCHASE INVOICE', left, 13, true)
  y -= 18
  text(`Invoice #: ${invoice.invoice_number}`, left, 10)
  y -= 14
  text(`Date: ${invoice.invoice_date}`, left, 10)
  y -= 14
  text(`Status: ${invoice.status}`, left, 10)
  y -= 22

  text(invoice.type === 'sales' ? 'Bill to:' : 'Vendor:', left, 10, true)
  y -= 14
  text(invoice.parties?.name, left, 10)
  y -= 14
  if (invoice.parties?.gstin) {
    text(`GSTIN: ${invoice.parties.gstin}`, left, 10)
    y -= 14
  }
  text(`State code: ${invoice.parties?.state_code}`, left, 10)
  y -= 24

  const col = {
    item: left, hsn: left + 150, qty: left + 210, rate: left + 250,
    taxable: left + 300, cgst: left + 360, sgst: left + 405, igst: left + 450, total: left + 495,
  }
  for (const [key, label] of [
    ['item', 'Item'], ['hsn', 'HSN'], ['qty', 'Qty'], ['rate', 'Rate'], ['taxable', 'Taxable'],
    ['cgst', 'CGST'], ['sgst', 'SGST'], ['igst', 'IGST'], ['total', 'Total'],
  ]) {
    text(label, col[key], 9, true)
  }
  y -= 16

  for (const li of lineItems) {
    text(String(li.items?.name ?? '').slice(0, 20), col.item, 9)
    text(li.hsn_sac_code, col.hsn, 9)
    text(li.quantity, col.qty, 9)
    text(li.rate, col.rate, 9)
    text(li.taxable_value, col.taxable, 9)
    text(li.cgst_amount, col.cgst, 9)
    text(li.sgst_amount, col.sgst, 9)
    text(li.igst_amount, col.igst, 9)
    text(li.line_total, col.total, 9)
    y -= 14
  }

  y -= 10
  const totalsX = left + 360
  text(`Subtotal: ${invoice.subtotal}`, totalsX, 10)
  y -= 14
  text(`CGST: ${invoice.cgst_total}`, totalsX, 10)
  y -= 14
  text(`SGST: ${invoice.sgst_total}`, totalsX, 10)
  y -= 14
  text(`IGST: ${invoice.igst_total}`, totalsX, 10)
  y -= 14
  text(`Grand Total: ${invoice.grand_total}`, totalsX, 12, true)

  return pdfDoc.save()
}
