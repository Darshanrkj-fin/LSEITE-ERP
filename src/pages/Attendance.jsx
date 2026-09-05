import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)
const STATUSES = ['present', 'absent', 'half_day']

export function Attendance() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [employeeId, setEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState(today())
  const [status, setStatus] = useState('present')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data, error: fetchError }, { data: empRows }] = await Promise.all([
      supabase.from('attendance').select('*, employees(name)').order('work_date', { ascending: false }),
      supabase.from('employees').select('id, name').eq('status', 'active').order('name'),
    ])
    if (fetchError) setError(fetchError.message)
    else setRecords(data)
    setEmployees(empRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: upsertError } = await supabase
      .from('attendance')
      .upsert(
        { company_id: profile.company_id, employee_id: employeeId, work_date: workDate, status },
        { onConflict: 'employee_id,work_date' }
      )
    setSubmitting(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Attendance</h1>
      <p className="mb-6 text-sm text-muted">
        Recorded for reporting only — doesn't currently feed the payroll run's salary calculation.
        Marking the same employee/date again updates that day's record.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {canEdit && (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Employee</span>
            <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="min-w-40 rounded border border-slate-300 px-3 py-2">
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-3 py-2 capitalize">
              {STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting} className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Mark Attendance'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Employee</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.work_date}</td>
              <td className="py-2 pr-4">{r.employees?.name}</td>
              <td className="py-2 pr-4 capitalize">{r.status.replace('_', ' ')}</td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-muted">
                No attendance recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
