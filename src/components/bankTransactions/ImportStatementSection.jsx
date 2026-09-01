import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { parseIdfcFirstStatement } from '../../lib/bankStatementParser'

// Parsing happens entirely client-side (see bankStatementParser.js) — the
// statement PDF itself is never uploaded anywhere. Parsed rows are shown
// here for review/correction and are only ever written to bank_transactions
// once explicitly confirmed, through the same insert path as typing a row
// in by hand (RLS-scoped, admin/accountant only) — never auto-imported.
export function ImportStatementSection({ companyId, existingTxns, onImported }) {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState(null) // null = no file parsed yet
  const [selected, setSelected] = useState({}) // index -> boolean
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const isLikelyDuplicate = (row) =>
    existingTxns.some((t) => t.transaction_date === row.date && Number(t.amount) === Number(row.amount))

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setImportResult(null)
    setParsing(true)
    try {
      const parsedRows = await parseIdfcFirstStatement(file)
      if (parsedRows.length === 0) {
        setError('No transactions could be read from this PDF. It may not match the expected IDFC FIRST Bank layout.')
        setRows(null)
      } else {
        setRows(parsedRows)
        const initialSelected = {}
        parsedRows.forEach((row, i) => {
          initialSelected[i] = !row.flagged && !isLikelyDuplicate(row)
        })
        setSelected(initialSelected)
      }
    } catch (err) {
      setError(`Failed to read this PDF: ${err.message}`)
      setRows(null)
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  const updateRow = (index, field, value) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  const toggleSelected = (index) => {
    setSelected((s) => ({ ...s, [index]: !s[index] }))
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  const handleImport = async () => {
    setError(null)
    setImporting(true)
    const toInsert = rows
      .map((row, i) => ({ row, i }))
      .filter(({ i }) => selected[i])
      .map(({ row }) => ({
        company_id: companyId,
        transaction_date: row.date,
        amount: row.amount,
        description: row.description,
      }))

    const { error: insertError } = await supabase.from('bank_transactions').insert(toInsert)
    setImporting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setImportResult(`Imported ${toInsert.length} transaction${toInsert.length === 1 ? '' : 's'}.`)
    setRows(null)
    setSelected({})
    onImported()
  }

  return (
    <div className="mb-8 rounded border border-line p-4">
      <h2 className="mb-2 text-lg font-semibold text-ink">Import Bank Statement (PDF)</h2>
      <p className="mb-4 text-sm text-muted">
        IDFC FIRST Bank statement PDFs only, for now. Parsed rows are shown below for review before anything is
        saved — nothing is imported automatically, and the file itself never leaves your browser.
      </p>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        disabled={parsing}
        className="mb-4 block text-sm"
      />
      {parsing && <p className="mb-4 text-sm text-muted">Reading statement…</p>}
      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {importResult && <p className="mb-4 text-sm text-teal">{importResult}</p>}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-3 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-muted">
                  <th className="py-2 pr-2" />
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Statement balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const duplicate = isLikelyDuplicate(row)
                  const needsReview = row.flagged || duplicate
                  return (
                    <tr key={i} className={`border-b border-slate-100 ${needsReview ? 'bg-clay/10' : ''}`}>
                      <td className="py-2 pr-2">
                        <input type="checkbox" checked={!!selected[i]} onChange={() => toggleSelected(i)} />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="date"
                          value={row.date ?? ''}
                          onChange={(e) => updateRow(i, 'date', e.target.value)}
                          className="w-32 rounded border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          value={row.description ?? ''}
                          onChange={(e) => updateRow(i, 'description', e.target.value)}
                          className="w-full min-w-48 rounded border border-slate-300 px-2 py-1"
                        />
                        {row.flagReason && <p className="mt-1 text-xs text-clay">{row.flagReason}</p>}
                        {duplicate && <p className="mt-1 text-xs text-clay">Possible duplicate of an existing transaction.</p>}
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          step="0.01"
                          value={row.amount ?? ''}
                          onChange={(e) => updateRow(i, 'amount', e.target.value === '' ? null : parseFloat(e.target.value))}
                          className="w-28 rounded border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-4 text-muted">{row.balance != null ? row.balance.toFixed(2) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mb-3 text-sm text-muted">
            Rows highlighted in red need a look — either a parsing issue or a likely duplicate — and start unchecked.
          </p>
          <button
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${selectedCount} Selected`}
          </button>
        </>
      )}
    </div>
  )
}
