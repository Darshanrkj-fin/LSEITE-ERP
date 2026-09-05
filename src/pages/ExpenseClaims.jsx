import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

export function ExpenseClaims() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [employees, setEmployees] = useState([])
  const [expenseAccounts, setExpenseAccounts] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [employeeId, setEmployeeId] = useState('')
  const [claimDate, setClaimDate] = useState(today())
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data: emps }, { data: expenses }, { data: banks }, { data: claimRows, error: fetchError }] = await Promise.all([
      supabase.from('employees').select('id, name').eq('status', 'active').order('name'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'expense'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'asset'),
      supabase
        .from('expense_claims')
        .select('*, employees(name)')
        .order('claim_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])
    setEmployees(emps ?? [])
    setExpenseAccounts(expenses ?? [])
    setBankAccounts(banks ?? [])
    if (fetchError) setError(fetchError.message)
    else setClaims(claimRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { data: request, error: rpcError } = await supabase.rpc('submit_expense_claim', {
      p_employee_id: employeeId,
      p_claim_date: claimDate,
      p_description: description,
      p_category: category || null,
      p_amount: parseFloat(amount),
      p_expense_account_id: expenseAccountId,
      p_bank_account_id: bankAccountId,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    } else {
      setInfo('Expense claim posted.')
    }
    setDescription('')
    setCategory('')
    setAmount('')
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Expense Claims</h1>
      <p className="mb-6 text-sm text-muted">
        Employee reimbursements, paid immediately from the chosen bank/cash account and posted to the
        chosen expense account. Not tied to any project — for project-specific cost tracking, use the
        project's own Expenses section instead.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {canEdit && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-4 rounded border border-line p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Employee</span>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
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

          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Date</span>
              <input
                type="date"
                required
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Amount</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Category (optional)</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Travel"
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Description</span>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Expense account</span>
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
            <span className="mb-1 block text-muted">Bank/cash account (paid from)</span>
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

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Submit Claim'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Employee</th>
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Amount</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{c.claim_date}</td>
              <td className="py-2 pr-4">{c.employees?.name}</td>
              <td className="py-2 pr-4">{c.description}</td>
              <td className="py-2 pr-4 text-muted">{c.category || ''}</td>
              <td className="py-2 pr-4">{c.amount}</td>
            </tr>
          ))}
          {claims.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted">
                No expense claims posted yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
