// Indian financial year: April 1 – March 31. Mirrors the same convention
// already used server-side by financial_year_for() for invoice numbering
// — this is the frontend's equivalent for report date-range defaults.
const today = () => new Date().toISOString().slice(0, 10)

function currentFyStartYear(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 1–12
  return month >= 4 ? year : year - 1
}

// The currently-running FY, from April 1 up to today — useful for
// "how are we doing so far this year" rather than a closed-year report.
export function thisFinancialYearRange() {
  return { from: `${currentFyStartYear()}-04-01`, to: today() }
}

// The most recently completed FY, in full (April 1 – March 31) — useful
// for annual filing once the year has closed.
export function lastFinancialYearRange() {
  const startYear = currentFyStartYear() - 1
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` }
}
