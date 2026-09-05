import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ImportStatementSection } from '../components/bankTransactions/ImportStatementSection'
import { AttachmentsSection } from '../components/AttachmentsSection'

const emptyTxn = { transaction_date: '', amount: '', description: '', bank_account_id: '' }

export function BankTransactions() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [txns, setTxns] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newTxn, setNewTxn] = useState(emptyTxn)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editTxn, setEditTxn] = useState(emptyTxn)
  const [savingEdit, setSavingEdit] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  // silent=true skips the loading flag — used after an import, so the
  // ImportStatementSection result summary isn't unmounted mid-display by
  // the "if (loading) return <p>Loading…</p>" guard below.
  const load = async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    const [{ data, error: fetchError }, { data: accounts }] = await Promise.all([
      supabase.from('bank_transactions').select('*, bank_accounts(account_name)').order('transaction_date', { ascending: false }),
      supabase.from('bank_accounts').select('id, account_name').order('account_name'),
    ])
    if (fetchError) setError(fetchError.message)
    else setTxns(data)
    setBankAccounts(accounts ?? [])
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    setAdding(true)
    const { error: insertError } = await supabase.from('bank_transactions').insert({
      transaction_date: newTxn.transaction_date,
      amount: newTxn.amount,
      description: newTxn.description || null,
      bank_account_id: newTxn.bank_account_id || null,
      company_id: profile.company_id,
    })
    setAdding(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewTxn(emptyTxn)
    load()
  }

  const startEdit = (txn) => {
    setEditingId(txn.id)
    setEditTxn({ ...txn, description: txn.description ?? '' })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id) => {
    setError(null)
    setSavingEdit(true)
    const { error: updateError } = await supabase
      .from('bank_transactions')
      .update({
        transaction_date: editTxn.transaction_date,
        amount: editTxn.amount,
        description: editTxn.description || null,
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

  const handleDelete = async (txn) => {
    if (!window.confirm(`Delete this bank transaction (${txn.amount} on ${txn.transaction_date})? This cannot be undone.`))
      return
    setError(null)
    const { error: deleteError } = await supabase.from('bank_transactions').delete().eq('id', txn.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Bank Transactions</h1>
      <p className="mb-6 text-sm text-muted">
        Manually entered lines from your actual bank statement. Positive amount = money in, negative = money out.
        Match these to recorded payments on the Reconciliation screen.
      </p>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      {canEdit && (
        <ImportStatementSection
          companyId={profile.company_id}
          existingTxns={txns}
          bankAccounts={bankAccounts}
          onImported={() => load({ silent: true })}
        />
      )}

      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Amount</th>
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Account</th>
            <th className="py-2 pr-4">Matched</th>
            {canEdit && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {txns.map((txn) => (
            <Fragment key={txn.id}>
            <tr className="border-b border-slate-100">
              {editingId === txn.id ? (
                <>
                  <td className="py-2 pr-4">
                    <input
                      type="date"
                      value={editTxn.transaction_date}
                      onChange={(e) => setEditTxn((f) => ({ ...f, transaction_date: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      step="0.01"
                      value={editTxn.amount}
                      onChange={(e) => setEditTxn((f) => ({ ...f, amount: e.target.value }))}
                      className="w-28 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={editTxn.description}
                      onChange={(e) => setEditTxn((f) => ({ ...f, description: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4 text-muted">{txn.bank_accounts?.account_name || '—'}</td>
                  <td className="py-2 pr-4">{txn.matched_payment_id ? 'Yes' : 'No'}</td>
                  <td className="space-x-2 py-2 pr-4">
                    <button
                      onClick={() => saveEdit(txn.id)}
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
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId((id) => (id === txn.id ? null : txn.id))}
                      className="text-left hover:underline"
                    >
                      {expandedId === txn.id ? '▾' : '▸'} {txn.transaction_date}
                    </button>
                  </td>
                  <td className={`py-2 pr-4 ${txn.amount < 0 ? 'text-clay' : ''}`}>{txn.amount}</td>
                  <td className="py-2 pr-4">{txn.description || '—'}</td>
                  <td className="py-2 pr-4 text-muted">{txn.bank_accounts?.account_name || '—'}</td>
                  <td className="py-2 pr-4">{txn.matched_payment_id ? 'Yes' : 'No'}</td>
                  {canEdit && (
                    <td className="space-x-2 py-2 pr-4">
                      <button onClick={() => startEdit(txn)} className="text-sm text-ink hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(txn)} className="text-sm text-clay hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </>
              )}
            </tr>
            {expandedId === txn.id && (
              <tr className="border-b border-slate-100 bg-slate-50">
                <td colSpan={canEdit ? 6 : 5} className="px-4 py-3">
                  <AttachmentsSection entityType="bank_transaction" entityId={txn.id} />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {txns.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted">
                No bank transactions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Date</span>
            <input
              type="date"
              required
              value={newTxn.transaction_date}
              onChange={(e) => setNewTxn((f) => ({ ...f, transaction_date: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Amount</span>
            <input
              type="number"
              required
              step="0.01"
              placeholder="negative = outflow"
              value={newTxn.amount}
              onChange={(e) => setNewTxn((f) => ({ ...f, amount: e.target.value }))}
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Description</span>
            <input
              type="text"
              value={newTxn.description}
              onChange={(e) => setNewTxn((f) => ({ ...f, description: e.target.value }))}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {bankAccounts.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block text-muted">Account</span>
              <select
                value={newTxn.bank_account_id}
                onChange={(e) => setNewTxn((f) => ({ ...f, bank_account_id: e.target.value }))}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">Not specified</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add transaction'}
          </button>
        </form>
      )}
    </div>
  )
}
