// Generic CSV bank-statement importer, alongside the IDFC-specific PDF
// parser (bankStatementParser.js). CSV formats vary a lot bank-to-bank, so
// this auto-detects common header spellings rather than assuming one bank's
// exact layout — a deliberately looser approach than the PDF parser's
// balance-continuity verification, since a CSV export isn't guaranteed to
// even carry a running-balance column. Returns the same row shape
// ({ date, description, amount, balance, flagged, flagReason }) so
// ImportStatementSection.jsx doesn't need to know which parser produced it.

const HEADER_ALIASES = {
  date: ['date', 'transaction date', 'txn date', 'value date'],
  description: ['description', 'narration', 'particulars', 'remarks', 'details'],
  debit: ['debit', 'withdrawal', 'dr', 'debit amount'],
  credit: ['credit', 'deposit', 'cr', 'credit amount'],
  amount: ['amount', 'transaction amount'],
  balance: ['balance', 'closing balance', 'running balance'],
}

function parseCsvLines(text) {
  // Minimal CSV split that respects double-quoted fields containing commas.
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          cells.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      cells.push(current.trim())
      return cells
    })
}

function findColumn(headerRow, keys) {
  const normalized = headerRow.map((h) => h.toLowerCase().trim())
  for (const key of keys) {
    const idx = normalized.indexOf(key)
    if (idx !== -1) return idx
  }
  return -1
}

function parseDate(raw) {
  const s = raw.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(s)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // DD-MMM-YYYY (e.g. 05-Sep-2026)
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
  const m2 = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s)
  if (m2) {
    const month = months[m2[2].toLowerCase()]
    if (month) return `${m2[3]}-${String(month).padStart(2, '0')}-${m2[1]}`
  }
  return null
}

function parseNumber(raw) {
  if (raw == null) return null
  const cleaned = raw.replace(/,/g, '').replace(/[₹$]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export async function parseCsvStatement(file) {
  const text = await file.text()
  const lines = parseCsvLines(text)
  if (lines.length < 2) return []

  const headerRow = lines[0]
  const dateCol = findColumn(headerRow, HEADER_ALIASES.date)
  const descCol = findColumn(headerRow, HEADER_ALIASES.description)
  const debitCol = findColumn(headerRow, HEADER_ALIASES.debit)
  const creditCol = findColumn(headerRow, HEADER_ALIASES.credit)
  const amountCol = findColumn(headerRow, HEADER_ALIASES.amount)
  const balanceCol = findColumn(headerRow, HEADER_ALIASES.balance)

  if (dateCol === -1 || (amountCol === -1 && debitCol === -1 && creditCol === -1)) {
    throw new Error(
      "Couldn't find recognizable Date and Amount (or Debit/Credit) columns in this CSV's header row."
    )
  }

  const rows = []
  for (const cells of lines.slice(1)) {
    const rawDate = cells[dateCol] ?? ''
    const date = parseDate(rawDate)
    const description = descCol !== -1 ? cells[descCol] ?? '' : ''

    let amount = null
    if (amountCol !== -1) {
      amount = parseNumber(cells[amountCol])
    } else {
      const debit = debitCol !== -1 ? parseNumber(cells[debitCol]) : null
      const credit = creditCol !== -1 ? parseNumber(cells[creditCol]) : null
      if (credit != null && credit !== 0) amount = credit
      else if (debit != null && debit !== 0) amount = -debit
    }

    const balance = balanceCol !== -1 ? parseNumber(cells[balanceCol]) : null

    const row = { date, description: description || null, amount, balance, flagged: false, flagReason: null }
    if (date == null) {
      row.flagged = true
      row.flagReason = `Could not read a valid date from "${rawDate}".`
    } else if (amount == null) {
      row.flagged = true
      row.flagReason = 'Could not read an amount for this row.'
    }
    rows.push(row)
  }

  return rows
}
