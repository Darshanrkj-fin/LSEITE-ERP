import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { parseIdfcFirstStatement } from '../../lib/bankStatementParser'
import { parseCsvStatement } from '../../lib/bankStatementCsvParser'

// Parsing happens entirely client-side (see bankStatementParser.js /
// bankStatementCsvParser.js) — the statement file itself is never uploaded
// anywhere. Clean rows (not flagged by the parser, not a likely repeat of
// an existing transaction) are imported automatically on upload — no
// per-row review step, per explicit user request. Duplicates and flagged
// rows are skipped rather than imported, and listed afterward so they can
// be added by hand (via the form below) if they turn out to be needed.
export function ImportStatementSection({ companyId, existingTxns, bankAccounts, onImported }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [bankAccountId, setBankAccountId] = useState('')

  const isLikelyDuplicate = (row) =>
    existingTxns.some((t) => t.transaction_date === row.date && Number(t.amount) === Number(row.amount))

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv')
      const parsedRows = isCsv ? await parseCsvStatement(file) : await parseIdfcFirstStatement(file)
      if (parsedRows.length === 0) {
        setError(
          isCsv
            ? "No transactions could be read from this CSV. Check that it has recognizable Date and Amount (or Debit/Credit) column headers."
            : 'No transactions could be read from this PDF. It may not match the expected IDFC FIRST Bank layout.'
        )
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
            bank_account_id: bankAccountId || null,
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
      setError(`Failed to read this file: ${err.message}`)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="mb-8 rounded border border-line p-4">
      <h2 className="mb-2 text-lg font-semibold text-ink">Import Bank Statement (PDF or CSV)</h2>
      <p className="mb-4 text-sm text-muted">
        PDF supports IDFC FIRST Bank statements specifically; CSV auto-detects common Date/Description/
        Amount (or Debit/Credit) column headers from any bank's export. The file never leaves your browser.
        Transactions that already exist (same date and amount) or that the parser couldn't confidently read
        are skipped automatically rather than imported — add those by hand below if needed.
      </p>

      {bankAccounts?.length > 0 && (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-muted">Bank account (optional)</span>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="min-w-40 rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Not specified</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name}
              </option>
            ))}
          </select>
        </label>
      )}

      <input
        type="file"
        accept="application/pdf,.csv,text/csv"
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
