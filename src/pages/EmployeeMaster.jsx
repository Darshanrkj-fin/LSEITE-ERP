import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyEmployee = { name: '', employee_code: '', join_date: '', monthly_gross_salary: '', status: 'active' }

export function EmployeeMaster() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newEmployee, setNewEmployee] = useState(emptyEmployee)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editEmployee, setEditEmployee] = useState(emptyEmployee)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase.from('employees').select('*').order('name')
    if (fetchError) setError(fetchError.message)
    else setEmployees(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('employees').insert({
      name: newEmployee.name,
      employee_code: newEmployee.employee_code || null,
      join_date: newEmployee.join_date,
      monthly_gross_salary: newEmployee.monthly_gross_salary,
      status: newEmployee.status,
      company_id: profile.company_id,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewEmployee(emptyEmployee)
    load()
  }

  const startEdit = (emp) => {
    setEditingId(emp.id)
    setEditEmployee({ ...emp, employee_code: emp.employee_code ?? '', monthly_gross_salary: String(emp.monthly_gross_salary) })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('employees')
      .update({
        name: editEmployee.name,
        employee_code: editEmployee.employee_code || null,
        join_date: editEmployee.join_date,
        monthly_gross_salary: editEmployee.monthly_gross_salary,
        status: editEmployee.status,
      })
      .eq('id', id)
    setSavingEdit(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditingId(null)
    load()
  }

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete employee "${emp.name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('employees').delete().eq('id', emp.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Employee Master</h1>
      <p className="mb-6 text-sm text-slate-500">Employees eligible for payroll runs.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Code</th>
            <th className="py-2 pr-4">Join date</th>
            <th className="py-2 pr-4">Monthly gross</th>
            <th className="py-2 pr-4">Status</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="border-b border-slate-100">
              {editingId === emp.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      value={editEmployee.name}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editEmployee.employee_code}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, employee_code: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editEmployee.join_date}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, join_date: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editEmployee.monthly_gross_salary}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, monthly_gross_salary: e.target.value }))}
                      className="w-28 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editEmployee.status}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, status: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(emp.id)}
                      disabled={savingEdit}
                      className="text-sm text-slate-800 hover:underline"
                    >
                      Save
                    </button>
                    <button onClick={cancelEdit} className="text-sm text-slate-500 hover:underline">
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4">{emp.name}</td>
                  <td className="py-2 pr-4">{emp.employee_code || '—'}</td>
                  <td className="py-2 pr-4">{emp.join_date}</td>
                  <td className="py-2 pr-4">{emp.monthly_gross_salary}</td>
                  <td className="py-2 pr-4 capitalize">{emp.status}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(emp)} className="text-sm text-slate-800 hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(emp)} className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-slate-400">
                No employees yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Name</span>
            <input
              required
              value={newEmployee.name}
              onChange={(e) => setNewEmployee((f) => ({ ...f, name: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Code</span>
            <input
              value={newEmployee.employee_code}
              onChange={(e) => setNewEmployee((f) => ({ ...f, employee_code: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Join date</span>
            <input
              type="date"
              required
              value={newEmployee.join_date}
              onChange={(e) => setNewEmployee((f) => ({ ...f, join_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Monthly gross</span>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={newEmployee.monthly_gross_salary}
              onChange={(e) => setNewEmployee((f) => ({ ...f, monthly_gross_salary: e.target.value }))}
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add employee'}
          </button>
        </form>
      )}
    </div>
  )
}
