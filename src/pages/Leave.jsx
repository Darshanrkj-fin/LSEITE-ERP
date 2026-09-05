import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)
const LEAVE_TYPES = ['sick', 'casual', 'earned', 'unpaid', 'other']

export function Leave() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [employeeId, setEmployeeId] = useState('')
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0])
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(today())
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data, error: fetchError }, { data: empRows }] = await Promise.all([
      supabase.from('leave').select('*, employees(name)').order('start_date', { ascending: false }),
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
    const { error: insertError } = await supabase.from('leave').insert({
      company_id: profile.company_id,
      employee_id: employeeId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setReason('')
    load()
  }

  const setStatus = async (id, status) => {
    setError(null)
    const { error: updateError } = await supabase.from('leave').update({ status }).eq('id', id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Leave</h1>
      <p className="mb-6 text-sm text-muted">
        Recorded for reporting only — doesn't currently feed the payroll run's salary calculation.
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
            <span className="mb-1 block text-muted">Type</span>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="rounded border border-slate-300 px-3 py-2 capitalize">
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">From</span>
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">To</span>
            <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" disabled={submitting} className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {submitting ? 'Recording…' : 'Record Leave'}
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Employee</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">From</th>
            <th className="py-2 pr-4">To</th>
            <th className="py-2 pr-4">Reason</th>
            <th className="py-2 pr-4">Status</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.employees?.name}</td>
              <td className="py-2 pr-4 capitalize">{r.leave_type}</td>
              <td className="py-2 pr-4">{r.start_date}</td>
              <td className="py-2 pr-4">{r.end_date}</td>
              <td className="py-2 pr-4 text-muted">{r.reason || '—'}</td>
              <td className="py-2 pr-4 capitalize">{r.status}</td>
              {canEdit && (
                <td className="space-x-2 py-2 pr-4">
                  {r.status !== 'approved' && (
                    <button onClick={() => setStatus(r.id, 'approved')} className="text-sm text-ink hover:underline">
                      Approve
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button onClick={() => setStatus(r.id, 'rejected')} className="text-sm text-clay hover:underline">
                      Reject
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-muted">
                No leave recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
