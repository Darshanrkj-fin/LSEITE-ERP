import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'

export function Ledger() {
  const [mode, setMode] = useState('account')
  const [accounts, setAccounts] = useState([])
  const [parties, setParties] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadOptions() {
      const [{ data: accountRows }, { data: partyRows }] = await Promise.all([
        supabase.from('chart_of_accounts').select('id, name').order('name'),
        supabase.from('parties').select('id, name').order('name'),
      ])
      setAccounts(accountRows ?? [])
      setParties(partyRows ?? [])
    }
    loadOptions()
  }, [])

  useEffect(() => {
    setSelectedId('')
    setRows([])
  }, [mode])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!selectedId) {
        setRows([])
        return
      }
      setLoading(true)
      setError(null)
      const query = supabase
        .from('ledger_entries')
        .select('*')
        .order('entry_date')
        .order('created_at')

      // Party-wise shows only entries against the party's control account
      // (Accounts Receivable/Payable) — including the revenue/tax/cash
      // legs too would give each row its own unrelated running balance
      // (party_running_balance is partitioned per account), which doesn't
      // add up to one coherent "what this party owes" figure.
      const { data, error: fetchError } =
        mode === 'account'
          ? await query.eq('account_id', selectedId)
          : await query.eq('party_id', selectedId).in('account_system_role', ['accounts_receivable', 'accounts_payable'])

      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, selectedId])

  const options = mode === 'account' ? accounts : parties
  const selectedName = options.find((o) => o.id === selectedId)?.name ?? ''

  const columns =
    mode === 'party'
      ? [
          { key: 'entry_date', label: 'Date' },
          { key: 'account_name', label: 'Account' },
          { key: 'reference_type', label: 'Reference' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'party_running_balance', label: 'Balance' },
        ]
      : [
          { key: 'entry_date', label: 'Date' },
          { key: 'account_name', label: 'Account' },
          { key: 'debit', label: 'Debit' },
          { key: 'credit', label: 'Credit' },
          { key: 'account_running_balance', label: 'Balance' },
        ]

  const handleDownloadCsv = () => downloadCsv(`ledger-${mode}-${selectedName}.csv`, columns, rows)
  const handleDownloadPdf = () =>
    downloadTablePdf({
      filename: `ledger-${mode}-${selectedName}.pdf`,
      title: `Ledger — ${selectedName}`,
      subtitle: mode === 'account' ? 'Account-wise' : 'Party-wise',
      columns,
      rows,
    })

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Ledger</h1>
      <p className="mb-6 text-sm text-slate-500">Account-wise or party-wise transaction history with a running balance.</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">View</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded border border-slate-300 px-3 py-2">
            <option value="account">Account-wise</option>
            <option value="party">Party-wise</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{mode === 'account' ? 'Account' : 'Party'}</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-w-[16rem] rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {selectedId && rows.length > 0 && (
          <>
            <button onClick={handleDownloadCsv} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Download CSV
            </button>
            <button onClick={handleDownloadPdf} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Download PDF
            </button>
          </>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-slate-500">Loading…</p>}

      {!loading && selectedId && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Account</th>
              {mode === 'party' && <th className="py-2 pr-4">Reference</th>}
              <th className="py-2 pr-4">Debit</th>
              <th className="py-2 pr-4">Credit</th>
              <th className="py-2 pr-4">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.entry_date}</td>
                <td className="py-2 pr-4">{r.account_name}</td>
                {mode === 'party' && <td className="py-2 pr-4 capitalize">{r.reference_type}</td>}
                <td className="py-2 pr-4">{r.debit > 0 ? r.debit : ''}</td>
                <td className="py-2 pr-4">{r.credit > 0 ? r.credit : ''}</td>
                <td className="py-2 pr-4">{mode === 'account' ? r.account_running_balance : r.party_running_balance}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={mode === 'party' ? 6 : 5} className="py-4 text-slate-400">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
