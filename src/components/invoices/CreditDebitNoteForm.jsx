import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Issues a manual, partial credit/debit note against one or more of the
// invoice's own line items — quantity-based only (a returned quantity of a
// line), not a flat price adjustment. Remaining-quantity limits shown here
// are for guidance; post_manual_credit_debit_note() re-validates them
// authoritatively regardless (never trust client input for tax math).
export function CreditDebitNoteForm({ invoiceId, lineItems, creditNoteLines, onIssued, onCancel }) {
  const [selected, setSelected] = useState({}) // line item id -> quantity string
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const alreadyAdjusted = (lineId) =>
    creditNoteLines.filter((l) => l.invoice_line_item_id === lineId).reduce((sum, l) => sum + Number(l.quantity), 0)

  const remaining = (line) => Number(line.quantity) - alreadyAdjusted(line.id)

  const toggleLine = (line) => {
    setSelected((s) => {
      const next = { ...s }
      if (line.id in next) delete next[line.id]
      else next[line.id] = String(remaining(line))
      return next
    })
  }

  const setQuantity = (lineId, value) => {
    setSelected((s) => ({ ...s, [lineId]: value }))
  }

  const selectedCount = Object.keys(selected).length

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    const adjustments = Object.entries(selected)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([invoice_line_item_id, qty]) => ({ invoice_line_item_id, quantity: Number(qty) }))
    if (adjustments.length === 0) {
      setError('Select at least one line and a quantity greater than zero.')
      return
    }
    setSubmitting(true)
    const { error: rpcError } = await supabase.rpc('post_manual_credit_debit_note', {
      p_invoice_id: invoiceId,
      p_reason: reason || null,
      p_line_adjustments: adjustments,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onIssued()
  }

  const adjustableLines = lineItems.filter((li) => remaining(li) > 0)

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded border border-line p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">New partial credit/debit note</h2>
      <p className="mb-3 text-sm text-muted">
        Pick the line(s) being returned or corrected, and how much of each. This doesn't reverse inventory —
        adjust stock separately if physical goods came back.
      </p>

      {error && <p className="mb-3 text-sm text-clay">{error}</p>}

      {adjustableLines.length === 0 ? (
        <p className="mb-3 text-sm text-muted">Every line on this invoice has already been fully adjusted.</p>
      ) : (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-2" />
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Invoice qty</th>
              <th className="py-2 pr-4">Remaining</th>
              <th className="py-2 pr-4">Adjust qty</th>
            </tr>
          </thead>
          <tbody>
            {adjustableLines.map((line) => {
              const isSelected = line.id in selected
              const max = remaining(line)
              return (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleLine(line)} />
                  </td>
                  <td className="py-2 pr-4">{line.items?.name}</td>
                  <td className="py-2 pr-4">{line.quantity}</td>
                  <td className="py-2 pr-4">{max}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={max}
                      disabled={!isSelected}
                      value={selected[line.id] ?? ''}
                      onChange={(e) => setQuantity(line.id, e.target.value)}
                      className="w-24 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-muted">Reason (optional)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. damaged on delivery, quantity dispute"
          className="w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || selectedCount === 0}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Issuing…' : 'Issue Note'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  )
}
