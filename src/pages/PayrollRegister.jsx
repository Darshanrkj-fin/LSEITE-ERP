import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const currentMonth = () => new Date().toISOString().slice(0, 7)

function toCsv(rows) {
  const header = ['Employee', 'Month', 'Gross', 'PF', 'ESI', 'Professional tax', 'Other', 'Total deductions', 'Net pay']
  const lines = rows.map((r) => [
    r.employees?.name,
    r.run_month,
    r.gross_salary,
    r.pf_deduction,
    r.esi_deduction,
    r.professional_tax_deduction,
    r.other_deductions,
    r.total_deductions,
    r.net_pay,
  ])
  return [header, ...lines].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function PayrollRegister() {
  const { session } = useAuth()
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('payroll_runs')
        .select('*, employees(name)')
        .eq('run_month', `${month}-01`)
        .order('created_at')
      if (cancelled) return
      if (fetchError) setError(fetchError.message)
      else setRows(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [month])

  const totals = rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross_salary,
      deductions: acc.deductions + r.total_deductions,
      net: acc.net + r.net_pay,
    }),
    { gross: 0, deductions: 0, net: 0 }
  )

  const handleDownloadCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-register-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPayslip = async (runId) => {
    setError(null)
    setDownloadingId(runId)
    try {
      const response = await fetch(`/api/payslip-pdf?id=${runId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to generate payslip (HTTP ${response.status})`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payslip-${runId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Payroll Register</h1>
      <p className="mb-6 text-sm text-muted">Every payroll run posted for the selected month.</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Month</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        </label>
        <button
          onClick={handleDownloadCsv}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Download CSV
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-4">Employee</th>
              <th className="py-2 pr-4">Gross</th>
              <th className="py-2 pr-4">PF</th>
              <th className="py-2 pr-4">ESI</th>
              <th className="py-2 pr-4">PT</th>
              <th className="py-2 pr-4">Other</th>
              <th className="py-2 pr-4">Total deductions</th>
              <th className="py-2 pr-4">Net pay</th>
              <th className="py-2 pr-4">Payslip</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{r.employees?.name}</td>
                <td className="py-2 pr-4">{r.gross_salary}</td>
                <td className="py-2 pr-4">{r.pf_deduction}</td>
                <td className="py-2 pr-4">{r.esi_deduction}</td>
                <td className="py-2 pr-4">{r.professional_tax_deduction}</td>
                <td className="py-2 pr-4">{r.other_deductions}</td>
                <td className="py-2 pr-4">{r.total_deductions}</td>
                <td className="py-2 pr-4">{r.net_pay}</td>
                <td className="py-2 pr-4">
                  <button
                    onClick={() => handleDownloadPayslip(r.id)}
                    disabled={downloadingId === r.id}
                    className="text-sm text-ink hover:underline"
                  >
                    {downloadingId === r.id ? 'Preparing…' : 'Download'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-muted">
                  No payroll runs for this month.
                </td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4" colSpan={6}>
                Total
              </td>
              <td className="py-2 pr-4">{totals.deductions.toFixed(2)}</td>
              <td className="py-2 pr-4">{totals.net.toFixed(2)}</td>
              <td className="py-2 pr-4"></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
