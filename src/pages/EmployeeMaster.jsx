import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyEmployee = { name: '', employee_code: '', join_date: '', monthly_gross_salary: '', status: 'active', department_id: '', designation_id: '', user_id: '' }

export function EmployeeMaster() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [companyUsers, setCompanyUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newEmployee, setNewEmployee] = useState(emptyEmployee)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editEmployee, setEditEmployee] = useState(emptyEmployee)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data, error: fetchError }, { data: deptRows }, { data: desigRows }, { data: userRows }] = await Promise.all([
      supabase.from('employees').select('*, departments(name), designations(name), users(full_name)').order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('designations').select('id, name').order('name'),
      supabase.from('users').select('id, full_name').order('full_name'),
    ])
    if (fetchError) setError(fetchError.message)
    else setEmployees(data)
    setDepartments(deptRows ?? [])
    setDesignations(desigRows ?? [])
    setCompanyUsers(userRows ?? [])
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
      department_id: newEmployee.department_id || null,
      designation_id: newEmployee.designation_id || null,
      user_id: newEmployee.user_id || null,
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
    setEditEmployee({
      ...emp,
      employee_code: emp.employee_code ?? '',
      monthly_gross_salary: String(emp.monthly_gross_salary),
      department_id: emp.department_id ?? '',
      designation_id: emp.designation_id ?? '',
      user_id: emp.user_id ?? '',
    })
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
        department_id: editEmployee.department_id || null,
        designation_id: editEmployee.designation_id || null,
        user_id: editEmployee.user_id || null,
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

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Employee Master</h1>
      <p className="mb-6 text-sm text-muted">Employees eligible for payroll runs.</p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Code</th>
            <th className="py-2 pr-4">Department</th>
            <th className="py-2 pr-4">Designation</th>
            <th className="py-2 pr-4">Join date</th>
            <th className="py-2 pr-4">Monthly gross</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Linked user</th>
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
                    <select
                      value={editEmployee.department_id}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, department_id: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="">—</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={editEmployee.designation_id}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, designation_id: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="">—</option>
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
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
                  <td className="py-2 pr-4">
                    <select
                      value={editEmployee.user_id}
                      onChange={(e) => setEditEmployee((f) => ({ ...f, user_id: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="">None</option>
                      {companyUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(emp.id)}
                      disabled={savingEdit}
                      className="text-sm text-ink hover:underline"
                    >
                      Save
                    </button>
                    <button onClick={cancelEdit} className="text-sm text-muted hover:underline">
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-4">{emp.name}</td>
                  <td className="py-2 pr-4">{emp.employee_code || '—'}</td>
                  <td className="py-2 pr-4 text-muted">{emp.departments?.name || '—'}</td>
                  <td className="py-2 pr-4 text-muted">{emp.designations?.name || '—'}</td>
                  <td className="py-2 pr-4">{emp.join_date}</td>
                  <td className="py-2 pr-4">{emp.monthly_gross_salary}</td>
                  <td className="py-2 pr-4 capitalize">{emp.status}</td>
                  <td className="py-2 pr-4 text-muted">{emp.users?.full_name || '—'}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(emp)} className="text-sm text-ink hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(emp)} className="text-sm text-clay hover:underline">
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
              <td colSpan={9} className="py-4 text-muted">
                No employees yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input
              required
              value={newEmployee.name}
              onChange={(e) => setNewEmployee((f) => ({ ...f, name: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Code</span>
            <input
              value={newEmployee.employee_code}
              onChange={(e) => setNewEmployee((f) => ({ ...f, employee_code: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Department</span>
            <select
              value={newEmployee.department_id}
              onChange={(e) => setNewEmployee((f) => ({ ...f, department_id: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Designation</span>
            <select
              value={newEmployee.designation_id}
              onChange={(e) => setNewEmployee((f) => ({ ...f, designation_id: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">None</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Join date</span>
            <input
              type="date"
              required
              value={newEmployee.join_date}
              onChange={(e) => setNewEmployee((f) => ({ ...f, join_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Monthly gross</span>
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
          <label className="text-sm">
            <span className="mb-1 block text-muted">Linked user account</span>
            <select
              value={newEmployee.user_id}
              onChange={(e) => setNewEmployee((f) => ({ ...f, user_id: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">None</option>
              {companyUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.id}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add employee'}
          </button>
        </form>
      )}
    </div>
  )
}
