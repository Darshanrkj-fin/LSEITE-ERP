import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Shared by every report's "Download PDF" button — a generic paginated
// table renderer (title + optional subtitle, header row repeated on every
// page). Runs entirely client-side: the data is already loaded in the
// browser via the same RLS-scoped queries the screen itself uses, so
// there's nothing for a server round-trip to add here. Reuses pdf-lib,
// already a dependency for invoice/payslip PDFs — no new dependency.
export async function downloadTablePdf({ filename, title, subtitle, columns, rows }) {
  const pageWidth = 841.89 // A4 landscape, since most of these reports are wide
  const pageHeight = 595.28
  const left = 30
  const topMargin = 40
  const bottomMargin = 30
  const rowHeight = 16

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const totalWidth = pageWidth - left * 2
  const specifiedWidth = columns.reduce((sum, c) => sum + (c.width ?? 0), 0)
  const unspecifiedCount = columns.filter((c) => !c.width).length
  const fallbackWidth = unspecifiedCount > 0 ? (totalWidth - specifiedWidth) / unspecifiedCount : 0
  const colX = []
  let x = left
  for (const c of columns) {
    colX.push(x)
    x += c.width ?? fallbackWidth
  }

  let page
  let y

  function drawHeader() {
    page = pdfDoc.addPage([pageWidth, pageHeight])
    y = pageHeight - topMargin
    page.drawText(title, { x: left, y, size: 14, font: bold, color: rgb(0, 0, 0) })
    y -= 18
    if (subtitle) {
      page.drawText(subtitle, { x: left, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
      y -= 16
    }
    y -= 6
    columns.forEach((c, i) => page.drawText(String(c.label), { x: colX[i], y, size: 9, font: bold, color: rgb(0, 0, 0) }))
    y -= rowHeight
  }

  drawHeader()

  for (const row of rows) {
    if (y < bottomMargin) drawHeader()
    columns.forEach((c, i) => {
      const value = row[c.key]
      page.drawText(value == null ? '' : String(value), { x: colX[i], y, size: 9, font, color: rgb(0, 0, 0) })
    })
    y -= rowHeight
  }

  const pdfBytes = await pdfDoc.save()
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
