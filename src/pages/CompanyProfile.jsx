import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyForm = {
  name: '',
  gstin: '',
  address: '',
  state_code: '',
  bank_name: '',
  bank_account_no: '',
  bank_ifsc: '',
  logo_url: '',
  udyam_number: '',
}

// Company rows can have null fields (bank details, GSTIN); React controlled
// inputs warn/misbehave on a null value, so coerce to '' for form state.
function toFormValues(row) {
  const values = { ...emptyForm }
  for (const key of Object.keys(emptyForm)) {
    values[key] = row[key] ?? ''
  }
  return values
}

export function CompanyProfile() {
  const { profile, refreshProfile } = useAuth()
  const [company, setCompany] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      if (!profile?.company_id) {
        if (!cancelled) {
          setCompany(null)
          setLoading(false)
        }
        return
      }
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single()
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setCompany(data)
        setForm(toFormValues(data))
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profile?.company_id])

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSaving(true)

    if (company) {
      const { data, error: updateError } = await supabase
        .from('companies')
        .update(form)
        .eq('id', company.id)
        .select()
        .single()
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      setCompany(data)
      setInfo('Saved.')
      return
    }

    const { data, error: bootstrapError } = await supabase.rpc('bootstrap_company', {
      p_name: form.name,
      p_gstin: form.gstin || null,
      p_address: form.address || null,
      p_state_code: form.state_code,
      p_bank_name: form.bank_name || null,
      p_bank_account_no: form.bank_account_no || null,
      p_bank_ifsc: form.bank_ifsc || null,
    })
    setSaving(false)
    if (bootstrapError) {
      setError(bootstrapError.message)
      return
    }
    setCompany(data)
    await refreshProfile()
    setInfo('Company created.')
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Company Profile</h1>
      <p className="mb-6 text-sm text-muted">
        {company ? 'GSTIN, address, and bank details.' : 'No company set up yet — create one to get started.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Company name" required disabled={!canEdit && company} value={form.name} onChange={handleChange('name')} />
        <Field
          label="GSTIN"
          value={form.gstin}
          onChange={handleChange('gstin')}
          disabled={!canEdit && company}
          placeholder="15-character GSTIN, leave blank if unregistered"
        />
        <Field label="Address" value={form.address} onChange={handleChange('address')} disabled={!canEdit && company} />
        <Field
          label="State code"
          required
          maxLength={2}
          value={form.state_code}
          onChange={handleChange('state_code')}
          disabled={!canEdit && company}
          placeholder="2-digit GST state code, e.g. 29"
        />
        <Field label="Bank name" value={form.bank_name} onChange={handleChange('bank_name')} disabled={!canEdit && company} />
        <Field label="Bank account no." value={form.bank_account_no} onChange={handleChange('bank_account_no')} disabled={!canEdit && company} />
        <Field label="Bank IFSC" value={form.bank_ifsc} onChange={handleChange('bank_ifsc')} disabled={!canEdit && company} />
        <Field
          label="Logo URL"
          value={form.logo_url}
          onChange={handleChange('logo_url')}
          disabled={!canEdit && company}
          placeholder="Link to an already-hosted PNG/JPG, printed on invoice PDFs"
        />
        <Field
          label="Udyam registration number"
          value={form.udyam_number}
          onChange={handleChange('udyam_number')}
          disabled={!canEdit && company}
          placeholder="Leave blank if not MSME-registered"
        />

        {error && <p className="text-sm text-clay">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        {(canEdit || !company) && (
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : company ? 'Save changes' : 'Create company'}
          </button>
        )}
      </form>
    </div>
  )
}

function Field({ label, ...inputProps }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="text"
        {...inputProps}
        className="w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-muted"
      />
    </label>
  )
}
