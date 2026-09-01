import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// IDFC FIRST Bank statement layout: "Transaction Date | Value Date |
// Particulars | Cheque No | Debit | Credit | Balance", repeated as a table
// header on every page.
//
// Two layout quirks make this harder than "one line = one row":
// 1. Particulars text is VERTICALLY CENTERED on the row, not top-aligned —
//    confirmed by inspecting real pdfjs output: for a 4-line particulars
//    block, the first ~2 lines sit ABOVE the date/amount line's own y, and
//    the rest sit below it. Row content is therefore assigned by nearest
//    row-center (the date line's y), not by "everything below this date
//    until the next one."
// 2. Particulars can continue onto the NEXT PAGE before that page's first
//    dated row appears — but pdfjs resets y-coordinates per page, so
//    nearest-center-by-y only makes sense WITHIN a page. Content appearing
//    before a page's first row-center is explicitly carried over to the
//    last row from the previous page instead.
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }
const DATE_RE = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/
const Y_TOLERANCE = 3
const FOOTER_RE = /^REGISTERED OFFICE|^Page \d+ of \d+$/i
const BOILERPLATE_LABELS = new Set([
  'Total Debit', 'Total Credit', 'Closing Balance', 'STATEMENT OF ACCOUNT',
])

function toIsoDate(text) {
  const m = DATE_RE.exec(text.trim())
  if (!m) return null
  const month = MONTHS[m[2]]
  if (!month) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1]}`
}

function toAmount(text) {
  const cleaned = text.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function median(numbers) {
  if (numbers.length === 0) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function groupIntoLines(items) {
  const lines = []
  for (const item of items) {
    let line = lines.find((l) => Math.abs(l.y - item.y) <= Y_TOLERANCE)
    if (!line) {
      line = { y: item.y, items: [] }
      lines.push(line)
    }
    line.items.push(item)
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x)
  return lines
}

// The column header itself is not one physical line — it's stacked across
// three ("Transaction"/"Cheque", then "Value Date"/"Particulars"/"Debit"/
// "Credit"/"Balance", then "Date"/"No"), confirmed from real pdfjs output.
// Excluding only the middle line left "Date"/"No" fragments to leak into
// the first row's particulars. Any line made up entirely of these label
// words, close to the anchor line, is treated as part of the header block.
const HEADER_WORDS = new Set(['Transaction', 'Date', 'Value', 'Particulars', 'Cheque', 'No', 'Debit', 'Credit', 'Balance'])

function findColumnBounds(lines) {
  for (const line of lines) {
    const byText = {}
    for (const it of line.items) byText[it.text] = it.x
    if ('Particulars' in byText && 'Debit' in byText && 'Credit' in byText && 'Balance' in byText) {
      let headerY = line.y
      for (const candidate of lines) {
        if (Math.abs(candidate.y - line.y) > 15) continue
        if (candidate.items.every((it) => HEADER_WORDS.has(it.text))) {
          headerY = Math.min(headerY, candidate.y)
        }
      }
      return {
        headerY,
        // Lower bound is intentionally unbounded, not byText.Particulars:
        // the header label sits indented/centered relative to the actual
        // left-aligned description text below it, so anchoring to the
        // header's own x clipped real data off the left edge. Dates are
        // excluded explicitly elsewhere, so anything left of Debit that
        // isn't a date is safe to treat as particulars text.
        particulars: [-Infinity, byText.Debit],
        debit: [byText.Debit, byText.Credit],
        credit: [byText.Credit, byText.Balance],
        balance: [byText.Balance, Infinity],
      }
    }
  }
  return null
}

function inRange(x, [lo, hi]) {
  return x >= lo - 5 && x < hi - 5
}

function assignColumn(item, bounds) {
  if (inRange(item.x, bounds.debit)) return 'debit'
  if (inRange(item.x, bounds.credit)) return 'credit'
  if (inRange(item.x, bounds.balance)) return 'balance'
  return 'particulars'
}

function newRow(date) {
  return { date, particularsParts: [], debit: null, credit: null, balance: null }
}

function applyItemToRow(row, item, bounds) {
  const column = assignColumn(item, bounds)
  if (column === 'particulars') {
    row.particularsParts.push(item.text)
  } else {
    const v = toAmount(item.text)
    if (v != null) row[column] = v
  }
}

// Processes one page's already-sorted, boilerplate-stripped lines. Returns
// the rows discovered on this page, plus a reference to whichever row
// should keep absorbing content at the very start of the NEXT page (its own
// last row, unless that page had no rows at all, in which case whatever
// carried in stays open).
function processPage(lines, bounds, carryOverRow) {
  const rowCenters = []
  for (const line of lines) {
    const first = line.items[0]
    if (first && toIsoDate(first.text) !== null) rowCenters.push(line.y)
  }

  const rows = []
  const rowsByY = new Map()
  for (const y of rowCenters) {
    const row = newRow(null)
    rows.push(row)
    rowsByY.set(y, row)
  }

  const nearestCenterY = (y) => {
    let best = rowCenters[0]
    let bestDist = Infinity
    for (const cy of rowCenters) {
      const d = Math.abs(cy - y)
      if (d < bestDist) {
        bestDist = d
        best = cy
      }
    }
    return best
  }

  let openingBalance = null
  let activeCarryOver = carryOverRow

  // Lines above this page's first row-center are ambiguous: some are a
  // genuine continuation of the previous page's last row, but if that first
  // row's own particulars also has above-center lines (the normal case —
  // see the module comment), those belong to THIS page's first row instead,
  // not the carry-over. Distinguish them using each page's own measured
  // line spacing: confirmed from real output that the gap between a true
  // row boundary and the next row's own content (~15.7) is consistently
  // larger than the gap between two wrapped lines of the same particulars
  // cell (~10.9) — so the largest gap within this preamble marks the split,
  // calibrated per page rather than a hardcoded pixel threshold.
  let carryOverCutoffY = -Infinity
  if (rowCenters.length > 0) {
    const preamble = lines.filter((l) => l.y > rowCenters[0])
    if (preamble.length > 1) {
      const typicalGap = median(
        lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0)
      )
      let largestGap = 0
      let splitAt = -Infinity
      for (let i = 1; i < preamble.length; i++) {
        const gap = preamble[i - 1].y - preamble[i].y
        if (gap > largestGap) {
          largestGap = gap
          splitAt = preamble[i].y
        }
      }
      if (largestGap > typicalGap * 1.25) carryOverCutoffY = splitAt
    }
  }

  for (const line of lines) {
    const first = line.items[0]
    const isRowStart = first && toIsoDate(first.text) !== null

    if (first?.text === 'Opening Balance') {
      const balItem = line.items.find((it) => inRange(it.x, bounds.balance))
      if (balItem) openingBalance = toAmount(balItem.text)
      continue
    }

    if (rowCenters.length === 0) {
      // No dated row on this page at all (shouldn't normally happen once
      // the statement's table has started) — everything belongs to
      // whatever row carried over from the previous page.
      if (activeCarryOver) {
        for (const it of line.items) applyItemToRow(activeCarryOver, it, bounds)
      }
      continue
    }

    if (line.y > rowCenters[0] && line.y > carryOverCutoffY && activeCarryOver) {
      // Above this page's first row-center AND above the detected row
      // boundary: continuation of the previous page's last row.
      for (const it of line.items) {
        if (toIsoDate(it.text) !== null) continue
        applyItemToRow(activeCarryOver, it, bounds)
      }
      continue
    }

    if (isRowStart) {
      const row = rowsByY.get(line.y)
      row.date = toIsoDate(first.text)
      for (const it of line.items) {
        if (toIsoDate(it.text) !== null) continue
        applyItemToRow(row, it, bounds)
      }
      continue
    }

    const nearest = rowsByY.get(nearestCenterY(line.y))
    for (const it of line.items) applyItemToRow(nearest, it, bounds)
  }

  return { rows, lastRow: rows[rows.length - 1] ?? carryOverRow, openingBalance }
}

async function extractRows(pdfDoc) {
  const allRows = []
  let carryOverRow = null
  let openingBalance = null

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const content = await page.getTextContent()
    const rawItems = content.items
      .filter((it) => it.str.trim())
      .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }))
    const sorted = [...rawItems].sort((a, b) => b.y - a.y || a.x - b.x)
    const allLines = groupIntoLines(sorted)
    const bounds = findColumnBounds(allLines)
    if (!bounds) continue // couldn't find the header on this page — its rows are lost, rather than guessing at layout

    const contentLines = []
    for (const line of allLines) {
      if (line.y >= bounds.headerY) continue // title, address, summary box, or the header row itself
      const joined = line.items.map((it) => it.text).join(' ')
      if (FOOTER_RE.test(joined)) continue
      if (line.items.length === 1 && BOILERPLATE_LABELS.has(line.items[0].text)) continue
      contentLines.push(line)
    }

    const { rows, lastRow, openingBalance: pageOpeningBalance } = processPage(contentLines, bounds, carryOverRow)
    if (pageOpeningBalance != null) openingBalance = pageOpeningBalance
    allRows.push(...rows)
    carryOverRow = lastRow
  }

  return { rows: allRows, openingBalance }
}

// Client-side only — the statement PDF and every row parsed from it never
// leave the browser except for the specific rows the user reviews and
// confirms, which then go through the normal bank_transactions insert path.
export async function parseIdfcFirstStatement(file) {
  const buffer = await file.arrayBuffer()
  const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise
  const { rows: rawRows, openingBalance } = await extractRows(pdfDoc)

  const rows = []
  let expectedBalance = openingBalance

  for (const r of rawRows) {
    const particulars = r.particularsParts.join(' ').replace(/\s+/g, ' ').trim()
    const amount = r.credit != null ? r.credit : r.debit != null ? -r.debit : null

    const row = {
      date: r.date,
      description: particulars || null,
      amount,
      balance: r.balance,
      flagged: false,
      flagReason: null,
    }

    if (r.date == null) {
      row.flagged = true
      row.flagReason = 'Could not read a valid date for this row.'
    } else if (amount == null) {
      row.flagged = true
      row.flagReason = 'Could not read an amount (debit/credit) for this row.'
    } else if (r.balance == null) {
      row.flagged = true
      row.flagReason = 'Could not read a running balance for this row.'
    } else if (expectedBalance != null) {
      const predicted = Math.round((expectedBalance + amount) * 100) / 100
      if (Math.abs(predicted - r.balance) > 0.01) {
        row.flagged = true
        row.flagReason = `Balance doesn't reconcile: expected ${predicted.toFixed(2)}, statement shows ${r.balance.toFixed(2)}.`
      }
    }

    if (r.balance != null) expectedBalance = r.balance
    rows.push(row)
  }

  return rows
}
