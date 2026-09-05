import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const emptyAccount = { chart_of_accounts_id: '', account_name: '', account_number: '', ifsc_code: '', bank_name: '' }

const maskAccountNumber = (num) => (num && num.length > 4 ? `••••${num.slice(-4)}` : num || '—')

// A metadata sidecar over an existing asset-type chart_of_accounts row —
// doesn't change how posting works (post_payment()/post_delivery_settlement()
// still point straight at chart_of_accounts); this just gives a friendlier
// name/number to pick from instead of a generic ledger account name.
export function BankAccounts() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [accounts, setAccounts] = useState([])
  const [coaOptions, setCoaOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newAccount, setNewAccount] = useState(emptyAccount)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: bankRows, error: fetchError }, { data: coaRows }] = await Promise.all([
      supabase.from('bank_accounts').select('*, chart_of_accounts(name)').order('account_name'),
      supabase.from('chart_of_accounts').select('id, name').eq('type', 'asset').order('name'),
    ])
    if (fetchError) setError(fetchError.message)
    else setAccounts(bankRows ?? [])
    setCoaOptions(coaRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('bank_accounts').insert({
      company_id: profile.company_id,
      chart_of_accounts_id: newAccount.chart_of_accounts_id,
      account_name: newAccount.account_name,
      account_number: newAccount.account_number || null,
      ifsc_code: newAccount.ifsc_code || null,
      bank_name: newAccount.bank_name || null,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewAccount(emptyAccount)
    load()
  }

  const handleDelete = async (account) => {
    if (!window.confirm(`Delete bank account "${account.account_name}"? This cannot be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('bank_accounts').delete().eq('id', account.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Bank Accounts</h1>
      <p className="mb-6 text-sm text-muted">
        Each bank account links to an existing asset ledger account — this only gives it a friendlier
        name/number to pick from; postings still go to the linked ledger account underneath.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Bank</th>
            <th className="py-2 pr-4">Account #</th>
            <th className="py-2 pr-4">IFSC</th>
            <th className="py-2 pr-4">Ledger account</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{a.account_name}</td>
              <td className="py-2 pr-4">{a.bank_name || '—'}</td>
              <td className="py-2 pr-4">{maskAccountNumber(a.account_number)}</td>
              <td className="py-2 pr-4">{a.ifsc_code || '—'}</td>
              <td className="py-2 pr-4 text-muted">{a.chart_of_accounts?.name}</td>
              {canEdit && (
                <td className="py-2 pr-4">
                  <button onClick={() => handleDelete(a)} className="text-sm text-clay hover:underline">
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted">
                No bank accounts set up yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Ledger account</span>
            <select
              required
              value={newAccount.chart_of_accounts_id}
              onChange={(e) => setNewAccount((f) => ({ ...f, chart_of_accounts_id: e.target.value }))}
              className="min-w-40 rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {coaOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Display name</span>
            <input
              required
              value={newAccount.account_name}
              onChange={(e) => setNewAccount((f) => ({ ...f, account_name: e.target.value }))}
              placeholder="e.g. HDFC Current A/C"
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Bank name</span>
            <input
              value={newAccount.bank_name}
              onChange={(e) => setNewAccount((f) => ({ ...f, bank_name: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Account number</span>
            <input
              value={newAccount.account_number}
              onChange={(e) => setNewAccount((f) => ({ ...f, account_number: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">IFSC</span>
            <input
              value={newAccount.ifsc_code}
              onChange={(e) => setNewAccount((f) => ({ ...f, ifsc_code: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add account'}
          </button>
        </form>
      )}
    </div>
  )
}
