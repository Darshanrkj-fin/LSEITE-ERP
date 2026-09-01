import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { parseIdfcFirstStatement } from '../../lib/bankStatementParser'

// Parsing happens entirely client-side (see bankStatementParser.js) — the
// statement PDF itself is never uploaded anywhere. Clean rows (not flagged
// by the parser's own balance-reconciliation check, not a likely repeat of
// an existing transaction) are imported automatically on upload — no
// per-row review step, per explicit user request. Duplicates and flagged
// rows are skipped rather than imported, and listed afterward so they can
// be added by hand (via the form below) if they turn out to be needed.
export function ImportStatementSection({ companyId, existingTxns, onImported }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const isLikelyDuplicate = (row) =>
    existingTxns.some((t) => t.transaction_date === row.date && Number(t.amount) === Number(row.amount))

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const parsedRows = await parseIdfcFirstStatement(file)
      if (parsedRows.length === 0) {
        setError('No transactions could be read from this PDF. It may not match the expected IDFC FIRST Bank layout.')
        return
      }

      const clean = []
      const duplicates = []
      const flagged = []
      for (const row of parsedRows) {
        if (row.flagged) flagged.push(row)
        else if (isLikelyDuplicate(row)) duplicates.push(row)
        else clean.push(row)
      }

      if (clean.length > 0) {
        const { error: insertError } = await supabase.from('bank_transactions').insert(
          clean.map((row) => ({
            company_id: companyId,
            transaction_date: row.date,
            amount: row.amount,
            description: row.description,
          }))
        )
        if (insertError) {
          setError(insertError.message)
          return
        }
      }

      setResult({ imported: clean.length, duplicates, flagged })
      onImported()
    } catch (err) {
      setError(`Failed to read this PDF: ${err.message}`)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="mb-8 rounded border border-line p-4">
      <h2 className="mb-2 text-lg font-semibold text-ink">Import Bank Statement (PDF)</h2>
      <p className="mb-4 text-sm text-muted">
        IDFC FIRST Bank statement PDFs only, for now. The file never leaves your browser. Transactions that already
        exist (same date and amount) or that the parser couldn't confidently read are skipped automatically rather
        than imported — add those by hand below if needed.
      </p>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        disabled={busy}
        className="mb-4 block text-sm"
      />
      {busy && <p className="mb-4 text-sm text-muted">Reading statement…</p>}
      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {result && (
        <div className="text-sm">
          <p className="mb-2 text-teal">
            Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}.
          </p>
          {result.duplicates.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-muted">
                Skipped {result.duplicates.length} likely duplicate{result.duplicates.length === 1 ? '' : 's'} (already
                in your transaction list):
              </p>
              <ul className="ml-4 list-disc text-muted">
                {result.duplicates.map((row, i) => (
                  <li key={i}>
                    {row.date} — {row.amount} — {row.description || '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.flagged.length > 0 && (
            <div>
              <p className="mb-1 text-clay">
                Skipped {result.flagged.length} row{result.flagged.length === 1 ? '' : 's'} that need a manual look:
              </p>
              <ul className="ml-4 list-disc text-clay">
                {result.flagged.map((row, i) => (
                  <li key={i}>
                    {row.date ?? '(no date)'} — {row.amount ?? '(no amount)'} — {row.description || '—'}
                    {row.flagReason ? ` (${row.flagReason})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
