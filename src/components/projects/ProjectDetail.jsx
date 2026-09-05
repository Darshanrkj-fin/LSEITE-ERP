import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { AttachmentsSection } from '../AttachmentsSection'

const today = () => new Date().toISOString().slice(0, 10)
const emptyTimesheet = { employee_id: '', task_id: '', work_date: today(), hours: '', billable: true, billing_rate: '', cost_rate: '' }
const emptyExpense = { expense_date: today(), description: '', amount: '', category: '' }
const emptyTask = { name: '', estimated_hours: '' }

export function ProjectDetail() {
  const { id } = useParams()
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [project, setProject] = useState(null)
  const [profitability, setProfitability] = useState(null)
  const [tasks, setTasks] = useState([])
  const [timesheets, setTimesheets] = useState([])
  const [expenses, setExpenses] = useState([])
  const [employees, setEmployees] = useState([])
  const [items, setItems] = useState([])
  const [incomeAccounts, setIncomeAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newTask, setNewTask] = useState(emptyTask)
  const [newTimesheet, setNewTimesheet] = useState(emptyTimesheet)
  const [newExpense, setNewExpense] = useState(emptyExpense)
  const [selectedTimesheets, setSelectedTimesheets] = useState({})
  const [invoiceItemId, setInvoiceItemId] = useState('')
  const [invoiceAccountId, setInvoiceAccountId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [invoicing, setInvoicing] = useState(false)
  const [info, setInfo] = useState(null)

  const load = async () => {
    setLoading(true)
    const [
      { data: proj, error: projError },
      { data: profit },
      { data: taskRows },
      { data: tsRows },
      { data: expenseRows },
      { data: employeeRows },
      { data: itemRows },
      { data: accountRows },
    ] = await Promise.all([
      supabase.from('projects').select('*, parties(name)').eq('id', id).single(),
      supabase.rpc('project_profitability', { p_project_id: id }),
      supabase.from('project_tasks').select('*').eq('project_id', id).order('created_at'),
      supabase.from('timesheets').select('*, employees(name), project_tasks(name)').eq('project_id', id).order('work_date', { ascending: false }),
      supabase.from('project_expenses').select('*').eq('project_id', id).order('expense_date', { ascending: false }),
      supabase.from('employees').select('id, name').eq('status', 'active').order('name'),
      supabase.from('items').select('id, name').eq('type', 'service').order('name'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'income').order('name'),
    ])
    if (projError) setError(projError.message)
    else setProject(proj)
    setProfitability(profit?.[0] ?? null)
    setTasks(taskRows ?? [])
    setTimesheets(tsRows ?? [])
    setExpenses(expenseRows ?? [])
    setEmployees(employeeRows ?? [])
    setItems(itemRows ?? [])
    setIncomeAccounts(accountRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleAddTask = async (e) => {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('project_tasks').insert({
      project_id: id,
      name: newTask.name,
      estimated_hours: newTask.estimated_hours === '' ? null : parseFloat(newTask.estimated_hours),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewTask(emptyTask)
    load()
  }

  const handleAddTimesheet = async (e) => {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('timesheets').insert({
      company_id: profile.company_id,
      project_id: id,
      employee_id: newTimesheet.employee_id,
      task_id: newTimesheet.task_id || null,
      work_date: newTimesheet.work_date,
      hours: parseFloat(newTimesheet.hours),
      billable: newTimesheet.billable,
      billing_rate: newTimesheet.billing_rate === '' ? null : parseFloat(newTimesheet.billing_rate),
      cost_rate: newTimesheet.cost_rate === '' ? null : parseFloat(newTimesheet.cost_rate),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewTimesheet(emptyTimesheet)
    load()
  }

  const setApproval = async (timesheetId, status) => {
    setError(null)
    const { error: updateError } = await supabase.from('timesheets').update({ approval_status: status }).eq('id', timesheetId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    setError(null)
    const { error: insertError } = await supabase.from('project_expenses').insert({
      company_id: profile.company_id,
      project_id: id,
      expense_date: newExpense.expense_date,
      description: newExpense.description,
      amount: parseFloat(newExpense.amount),
      category: newExpense.category || null,
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewExpense(emptyExpense)
    load()
  }

  const toggleTimesheet = (tsId) => {
    setSelectedTimesheets((s) => {
      const next = { ...s }
      if (tsId in next) delete next[tsId]
      else next[tsId] = true
      return next
    })
  }

  const invoiceableTimesheets = timesheets.filter((t) => t.billable && t.approval_status === 'approved' && !t.invoice_id)
  const selectedIds = Object.keys(selectedTimesheets)

  const handleInvoice = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setInvoicing(true)
    const { data: request, error: rpcError } = await supabase.rpc('submit_project_invoice', {
      p_project_id: id,
      p_invoice_date: invoiceDate,
      p_item_id: invoiceItemId,
      p_revenue_expense_account_id: invoiceAccountId,
      p_timesheet_ids: selectedIds,
    })
    setInvoicing(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (request.status === 'pending') {
      setInfo(`Submitted for approval (needs: ${request.approval_chain.join(', ')}). See Approvals.`)
    }
    setSelectedTimesheets({})
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>
  if (error && !project) return <p className="text-sm text-clay">{error}</p>

  return (
    <div className="max-w-3xl">
      <Link to="/projects" className="mb-4 inline-block text-sm text-muted hover:underline">
        ← Back
      </Link>

      <h1 className="mb-1 text-xl font-semibold font-display text-ink">{project.project_code}</h1>
      <p className="mb-6 text-sm text-muted">
        Client: {project.parties?.name} · {project.start_date} to {project.end_date || 'ongoing'} ·{' '}
        <span className="capitalize">{project.status}</span>
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}
      {info && <p className="mb-4 text-sm text-green-600">{info}</p>}

      {profitability && (
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          {[
            ['Revenue', profitability.revenue],
            ['Labour cost', profitability.labour_cost],
            ['Expense cost', profitability.expense_cost],
            ['Profit', profitability.profit],
            ['Margin', profitability.margin_pct != null ? `${profitability.margin_pct}%` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-line bg-mist px-3 py-2">
              <div className="text-muted">{label}</div>
              <div className="font-semibold text-ink">{value}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink">Tasks</h2>
      <table className="mb-3 w-full text-sm">
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-1 pr-4">{t.name}</td>
              <td className="py-1 pr-4 text-muted">{t.estimated_hours ? `${t.estimated_hours}h est.` : ''}</td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td className="py-2 text-muted">No tasks yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      {canEdit && (
        <form onSubmit={handleAddTask} className="mb-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Task name</span>
            <input
              required
              value={newTask.name}
              onChange={(e) => setNewTask((f) => ({ ...f, name: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Estimated hours</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newTask.estimated_hours}
              onChange={(e) => setNewTask((f) => ({ ...f, estimated_hours: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Add Task
          </button>
        </form>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink">Timesheets</h2>
      <div className="mb-3 max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="w-8 py-2" />
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Employee</th>
              <th className="py-2 pr-4">Task</th>
              <th className="py-2 pr-4">Hours</th>
              <th className="py-2 pr-4">Billable</th>
              <th className="py-2 pr-4">Rate</th>
              <th className="py-2 pr-4">Status</th>
              {canEdit && <th className="py-2 pr-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {timesheets.map((t) => {
              const canSelect = t.billable && t.approval_status === 'approved' && !t.invoice_id
              return (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-1">
                    {canSelect && <input type="checkbox" checked={t.id in selectedTimesheets} onChange={() => toggleTimesheet(t.id)} />}
                  </td>
                  <td className="py-1 pr-4">{t.work_date}</td>
                  <td className="py-1 pr-4">{t.employees?.name}</td>
                  <td className="py-1 pr-4">{t.project_tasks?.name || '—'}</td>
                  <td className="py-1 pr-4">{t.hours}</td>
                  <td className="py-1 pr-4">{t.billable ? 'Yes' : 'No'}</td>
                  <td className="py-1 pr-4">{t.billing_rate ?? '—'}</td>
                  <td className="py-1 pr-4">
                    {t.invoice_id ? 'Invoiced' : <span className="capitalize">{t.approval_status}</span>}
                  </td>
                  {canEdit && (
                    <td className="space-x-2 py-1 pr-4">
                      {!t.invoice_id && t.approval_status !== 'approved' && (
                        <button onClick={() => setApproval(t.id, 'approved')} className="text-ink hover:underline">
                          Approve
                        </button>
                      )}
                      {!t.invoice_id && t.approval_status !== 'rejected' && (
                        <button onClick={() => setApproval(t.id, 'rejected')} className="text-clay hover:underline">
                          Reject
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
            {timesheets.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-muted">
                  No timesheet entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={handleAddTimesheet} className="mb-6 flex flex-wrap items-end gap-3 rounded border border-line p-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Employee</span>
            <select
              required
              value={newTimesheet.employee_id}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, employee_id: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Task</span>
            <select
              value={newTimesheet.task_id}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, task_id: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">None</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input
              type="date"
              required
              value={newTimesheet.work_date}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, work_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Hours</span>
            <input
              type="number"
              required
              step="0.01"
              min="0.01"
              value={newTimesheet.hours}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, hours: e.target.value }))}
              className="w-24 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newTimesheet.billable}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, billable: e.target.checked }))}
            />
            Billable
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Billing rate</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newTimesheet.billing_rate}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, billing_rate: e.target.value }))}
              className="w-24 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Cost rate</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newTimesheet.cost_rate}
              onChange={(e) => setNewTimesheet((f) => ({ ...f, cost_rate: e.target.value }))}
              className="w-24 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Log Time
          </button>
        </form>
      )}

      {canEdit && invoiceableTimesheets.length > 0 && (
        <form onSubmit={handleInvoice} className="mb-6 rounded border border-line p-3">
          <h2 className="mb-2 text-sm font-semibold text-ink">Generate invoice from selected timesheets</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Service item</span>
              <select
                required
                value={invoiceItemId}
                onChange={(e) => setInvoiceItemId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Revenue account</span>
              <select
                required
                value={invoiceAccountId}
                onChange={(e) => setInvoiceAccountId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {incomeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Invoice date</span>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={invoicing || selectedIds.length === 0}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {invoicing ? 'Posting…' : `Invoice ${selectedIds.length} Selected`}
            </button>
          </div>
        </form>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink">Project Expenses</h2>
      <table className="mb-3 w-full text-sm">
        <tbody>
          {expenses.map((exp) => (
            <tr key={exp.id} className="border-b border-slate-100">
              <td className="py-1 pr-4">{exp.expense_date}</td>
              <td className="py-1 pr-4">{exp.description}</td>
              <td className="py-1 pr-4 text-muted">{exp.category || ''}</td>
              <td className="py-1 pr-4">{exp.amount}</td>
            </tr>
          ))}
          {expenses.length === 0 && (
            <tr>
              <td className="py-2 text-muted">No project expenses recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
      {canEdit && (
        <form onSubmit={handleAddExpense} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input
              type="date"
              required
              value={newExpense.expense_date}
              onChange={(e) => setNewExpense((f) => ({ ...f, expense_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Description</span>
            <input
              required
              value={newExpense.description}
              onChange={(e) => setNewExpense((f) => ({ ...f, description: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Category</span>
            <input
              value={newExpense.category}
              onChange={(e) => setNewExpense((f) => ({ ...f, category: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Amount</span>
            <input
              type="number"
              required
              step="0.01"
              min="0.01"
              value={newExpense.amount}
              onChange={(e) => setNewExpense((f) => ({ ...f, amount: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Add Expense
          </button>
        </form>
      )}

      <div className="mt-6 border-t border-line pt-4">
        <AttachmentsSection entityType="project" entityId={project.id} />
      </div>
    </div>
  )
}
