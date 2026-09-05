import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'

const today = () => new Date().toISOString().slice(0, 10)
const startOfYear = () => `${new Date().getFullYear()}-01-01`

const COLUMNS = [
  { key: 'event_date', label: 'Date' },
  { key: 'event_type', label: 'Type' },
  { key: 'reference_number', label: 'Reference' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
  { key: 'running_balance', label: 'Balance' },
]

// Chronological invoice/payment history for one party, with a running
// balance summed client-side (party_statement() itself just returns the
// raw rows — see schema.sql comment on why that's enough).
export function PartyStatement() {
  const [parties, setParties] = useState([])
  const [partyId, setPartyId] = useState('')
  const [from, setFrom] = useState(startOfYear())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadParties() {
      const { data, error: fetchError } = await supabase.from('parties').select('id, name, type').order('name')
      if (fetchError) setError(fetchError.message)
      else setParties(data)
    }
    loadParties()
  }, [])

  useEffect(() => {
    if (!partyId) {
      setRows([])
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase.rpc('party_statement', {
        p_party_id: partyId,
        p_from: from,
        p_to: to,
      })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [partyId, from, to])

  let running = 0
  const rowsWithBalance = rows.map((r) => {
    running += r.debit - r.credit
    return { ...r, running_balance: running.toFixed(2) }
  })

  const partyName = parties.find((p) => p.id === partyId)?.name ?? 'statement'
  const handleDownloadCsv = () => downloadCsv(`${partyName}-statement.csv`, COLUMNS, rowsWithBalance)
  const handleDownloadPdf = () =>
    downloadTablePdf({
      filename: `${partyName}-statement.pdf`,
      title: `Party Statement — ${partyName}`,
      subtitle: `${from} to ${to}`,
      columns: COLUMNS,
      rows: rowsWithBalance,
    })

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Party Statement</h1>
      <p className="mb-6 text-sm text-muted">
        Chronological invoice and payment history for one party. Balance is debit minus credit
        throughout — positive means the party owes the business, negative means the business owes
        the party (this applies to vendors too, so a running vendor balance normally reads negative).
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Party</span>
          <select
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            className="min-w-48 rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select a party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <button onClick={handleDownloadCsv} disabled={rowsWithBalance.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download CSV
        </button>
        <button onClick={handleDownloadPdf} disabled={rowsWithBalance.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download PDF
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {!partyId ? (
        <p className="text-muted">Pick a party to see their statement.</p>
      ) : loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Reference</th>
              <th className="py-2 pr-4">Debit</th>
              <th className="py-2 pr-4">Credit</th>
              <th className="py-2 pr-4">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithBalance.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.event_date}</td>
                <td className="py-2 pr-4 capitalize">{r.event_type}</td>
                <td className="py-2 pr-4">{r.reference_number || '—'}</td>
                <td className="py-2 pr-4">{r.debit || '—'}</td>
                <td className="py-2 pr-4">{r.credit || '—'}</td>
                <td className="py-2 pr-4">{r.running_balance}</td>
              </tr>
            ))}
            {rowsWithBalance.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-muted">
                  No activity in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
