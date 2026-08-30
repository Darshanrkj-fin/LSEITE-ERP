import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../lib/exportCsv'
import { downloadTablePdf } from '../lib/exportPdf'

const today = () => new Date().toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'account_name', label: 'Account' },
  { key: 'account_type', label: 'Type' },
  { key: 'total_debit', label: 'Debit' },
  { key: 'total_credit', label: 'Credit' },
]

export function TrialBalance() {
  const [asOf, setAsOf] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase.rpc('trial_balance', { p_as_of: asOf })
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [asOf])

  const totalDebit = rows.reduce((sum, r) => sum + r.total_debit, 0)
  const totalCredit = rows.reduce((sum, r) => sum + r.total_credit, 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005
  const nonZeroRows = rows.filter((r) => r.total_debit > 0 || r.total_credit > 0)

  const handleDownloadCsv = () => downloadCsv(`trial-balance-${asOf}.csv`, COLUMNS, nonZeroRows)
  const handleDownloadPdf = () =>
    downloadTablePdf({ filename: `trial-balance-${asOf}.pdf`, title: 'Trial Balance', subtitle: `As of ${asOf}`, columns: COLUMNS, rows: nonZeroRows })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Trial Balance</h1>
      <p className="mb-6 text-sm text-slate-500">Total debit and credit posted to each account, as of a date.</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">As of</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button onClick={handleDownloadCsv} disabled={nonZeroRows.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download CSV
        </button>
        <button onClick={handleDownloadPdf} disabled={nonZeroRows.length === 0} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          Download PDF
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">Account</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Debit</th>
              <th className="py-2 pr-4">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.total_debit > 0 || r.total_credit > 0)
              .map((r) => (
                <tr key={r.account_id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{r.account_name}</td>
                  <td className="py-2 pr-4 capitalize">{r.account_type}</td>
                  <td className="py-2 pr-4">{r.total_debit}</td>
                  <td className="py-2 pr-4">{r.total_credit}</td>
                </tr>
              ))}
            <tr className="font-semibold">
              <td className="py-2 pr-4" colSpan={2}>
                Total
              </td>
              <td className="py-2 pr-4">{totalDebit.toFixed(2)}</td>
              <td className="py-2 pr-4">{totalCredit.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {!loading && (
        <p className={`mt-4 text-sm ${balanced ? 'text-green-600' : 'text-red-600'}`}>
          {balanced ? '✓ Balanced' : '✗ Not balanced — this should never happen, please report it.'}
        </p>
      )}
    </div>
  )
}
