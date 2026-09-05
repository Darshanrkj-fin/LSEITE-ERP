import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

export function ProjectForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState([])
  const [employees, setEmployees] = useState([])
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [projectCode, setProjectCode] = useState('')
  const [clientPartyId, setClientPartyId] = useState('')
  const [pmEmployeeId, setPmEmployeeId] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [billingMethod, setBillingMethod] = useState('hourly')
  const [billingRate, setBillingRate] = useState('')
  const [costCentre, setCostCentre] = useState('')

  useEffect(() => {
    async function loadOptions() {
      const [{ data: partyRows }, { data: employeeRows }] = await Promise.all([
        supabase.from('parties').select('id, name, type').in('type', ['customer', 'both']).order('name'),
        supabase.from('employees').select('id, name').eq('status', 'active').order('name'),
      ])
      setClients(partyRows ?? [])
      setEmployees(employeeRows ?? [])
    }
    loadOptions()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data, error: insertError } = await supabase
      .from('projects')
      .insert({
        company_id: profile.company_id,
        project_code: projectCode,
        client_party_id: clientPartyId,
        project_manager_employee_id: pmEmployeeId || null,
        start_date: startDate,
        end_date: endDate || null,
        budget: budget === '' ? null : parseFloat(budget),
        billing_method: billingMethod,
        billing_rate: billingRate === '' ? null : parseFloat(billingRate),
        cost_centre: costCentre || null,
      })
      .select()
      .single()
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate(`/projects/${data.id}`)
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-semibold font-display text-ink">New Project</h1>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Project code</span>
          <input
            required
            value={projectCode}
            onChange={(e) => setProjectCode(e.target.value)}
            placeholder="e.g. PRJ-001"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Client</span>
          <select
            required
            value={clientPartyId}
            onChange={(e) => setClientPartyId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Project manager</span>
          <select
            value={pmEmployeeId}
            onChange={(e) => setPmEmployeeId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">None</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted">Start date</span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted">End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted">Billing method</span>
            <select
              value={billingMethod}
              onChange={(e) => setBillingMethod(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed (invoiced via Sales Invoices directly)</option>
            </select>
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted">Reference billing rate</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={billingRate}
              onChange={(e) => setBillingRate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted">Budget</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted">Cost centre</span>
            <input
              value={costCentre}
              onChange={(e) => setCostCentre(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Project'}
        </button>
      </form>
    </div>
  )
}
