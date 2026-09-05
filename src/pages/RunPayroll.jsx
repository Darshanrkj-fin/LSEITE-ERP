import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const currentMonth = () => new Date().toISOString().slice(0, 7)

export function RunPayroll() {
  const { session } = useAuth()

  const [employees, setEmployees] = useState([])
  const [expenseAccounts, setExpenseAccounts] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])

  const [employeeId, setEmployeeId] = useState('')
  const [month, setMonth] = useState(currentMonth())
  const [grossSalary, setGrossSalary] = useState('')
  const [pf, setPf] = useState('0')
  const [esi, setEsi] = useState('0')
  const [pt, setPt] = useState('0')
  const [other, setOther] = useState('0')
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [lastRunId, setLastRunId] = useState(null)

  useEffect(() => {
    async function loadOptions() {
      const [{ data: emps }, { data: expenses }, { data: banks }] = await Promise.all([
        supabase.from('employees').select('id, name, monthly_gross_salary').eq('status', 'active').order('name'),
        supabase.from('chart_of_accounts').select('id, name').eq('type', 'expense'),
        supabase.from('chart_of_accounts').select('id, name').eq('type', 'asset'),
      ])
      setEmployees(emps ?? [])
      setExpenseAccounts(expenses ?? [])
      setBankAccounts(banks ?? [])
    }
    loadOptions()
  }, [])

  const handleEmployeeChange = (id) => {
    setEmployeeId(id)
    const emp = employees.find((e) => e.id === id)
    if (emp) setGrossSalary(String(emp.monthly_gross_salary))
  }

  const totalDeductions = (parseFloat(pf) || 0) + (parseFloat(esi) || 0) + (parseFloat(pt) || 0) + (parseFloat(other) || 0)
  const netPay = (parseFloat(grossSalary) || 0) - totalDeductions

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    const { data: request, error: postError } = await supabase.rpc('submit_payroll_run', {
      p_employee_id: employeeId,
      p_run_month: `${month}-01`,
      p_gross_salary: parseFloat(grossSalary),
      p_pf_deduction: parseFloat(pf) || 0,
      p_esi_deduction: parseFloat(esi) || 0,
      p_professional_tax_deduction: parseFloat(pt) || 0,
      p_other_deductions: parseFloat(other) || 0,
      p_salary_expense_account_id: expenseAccountId,
      p_bank_account_id: bankAccountId,
    })
    setSubmitting(false)

    if (postError) {
      setError(postError.message)
      return
    }

    const employeeName = employees.find((e) => e.id === employeeId)?.name
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
      setLastRunId(null)
    } else {
      setInfo(`Payroll posted for ${employeeName} — net pay ${netPay.toFixed(2)}.`)
      setLastRunId(request.result_entity_id)
    }
    setPf('0')
    setEsi('0')
    setPt('0')
    setOther('0')
  }

  const handleDownloadPayslip = async (runId) => {
    setError(null)
    setDownloading(true)
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
      setDownloading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Run Payroll</h1>
      <p className="mb-6 text-sm text-muted">
        Posts one employee's salary for a month to the ledger and generates a payslip. Deduction amounts are entered
        directly — this app doesn't compute PF/ESI/professional tax itself; confirm the correct figures with your CA.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Employee</span>
          <select
            required
            value={employeeId}
            onChange={(e) => handleEmployeeChange(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Month</span>
          <input
            type="month"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Gross salary</span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={grossSalary}
            onChange={(e) => setGrossSalary(e.target.value)}
            className="w-32 rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">PF</span>
            <input type="number" min="0" step="0.01" value={pf} onChange={(e) => setPf(e.target.value)} className="w-24 rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">ESI</span>
            <input type="number" min="0" step="0.01" value={esi} onChange={(e) => setEsi(e.target.value)} className="w-24 rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Professional tax</span>
            <input type="number" min="0" step="0.01" value={pt} onChange={(e) => setPt(e.target.value)} className="w-24 rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Other</span>
            <input type="number" min="0" step="0.01" value={other} onChange={(e) => setOther(e.target.value)} className="w-24 rounded border border-slate-300 px-3 py-2" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Salary expense account</span>
          <select
            required
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Bank/cash account</span>
          <select
            required
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm text-slate-600">
          Total deductions: {totalDeductions.toFixed(2)} — Net pay: <span className="font-semibold">{netPay.toFixed(2)}</span>
        </p>

        {error && <p className="text-sm text-clay">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Run Payroll'}
          </button>
          {lastRunId && (
            <button
              type="button"
              onClick={() => handleDownloadPayslip(lastRunId)}
              disabled={downloading}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {downloading ? 'Preparing…' : 'Download Payslip'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
