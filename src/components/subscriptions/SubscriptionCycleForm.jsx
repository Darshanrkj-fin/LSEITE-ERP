import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

const today = () => new Date().toISOString().slice(0, 10)
const emptyLine = { item_id: '', quantity: '1', rate: '' }

export function SubscriptionCycleForm({ basePath }) {
  const navigate = useNavigate()

  const [subscriptions, setSubscriptions] = useState([])
  const [items, setItems] = useState([])
  const [subscriptionId, setSubscriptionId] = useState('')
  const [cycleDate, setCycleDate] = useState(today())
  const [lines, setLines] = useState([{ ...emptyLine }])

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadOptions() {
      const [{ data: subs }, { data: itemRows }] = await Promise.all([
        supabase.from('subscriptions').select('id, parties(name)').eq('status', 'active'),
        supabase.from('items').select('id, name'),
      ])
      setSubscriptions(subs ?? [])
      setItems(itemRows ?? [])
    }
    loadOptions()
  }, [])

  const updateLine = (index, field, value) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }
  const addLine = () => setLines((ls) => [...ls, { ...emptyLine }])
  const removeLine = (index) => setLines((ls) => ls.filter((_, i) => i !== index))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const payloadLines = lines.filter((l) => l.item_id && parseFloat(l.quantity) > 0 && parseFloat(l.rate) >= 0)
    if (payloadLines.length === 0) {
      setError('Add at least one valid item.')
      return
    }

    setSubmitting(true)
    const { data: cycle, error: cycleError } = await supabase
      .from('subscription_cycles')
      .insert({ subscription_id: subscriptionId, cycle_date: cycleDate })
      .select()
      .single()
    if (cycleError) {
      setSubmitting(false)
      setError(cycleError.message)
      return
    }

    const { error: itemsError } = await supabase.from('subscription_cycle_items').insert(
      payloadLines.map((l) => ({
        subscription_cycle_id: cycle.id,
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        rate: parseFloat(l.rate),
      }))
    )
    setSubmitting(false)
    if (itemsError) {
      setError(itemsError.message)
      return
    }
    navigate(`${basePath}/${cycle.id}`)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold font-display text-ink">New Subscription Cycle</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Subscription</span>
          <select
            required
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.parties?.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Cycle date</span>
          <input
            type="date"
            required
            value={cycleDate}
            onChange={(e) => setCycleDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Items this cycle</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-muted">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Rate</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <select
                      value={line.item_id}
                      onChange={(e) => updateLine(i, 'item_id', e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="">Select…</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                      className="w-20 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.rate}
                      onChange={(e) => updateLine(i, 'rate', e.target.value)}
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-sm text-clay hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addLine} className="mt-2 text-sm text-slate-600 hover:underline">
            + Add item
          </button>
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Draft Cycle'}
        </button>
      </form>
    </div>
  )
}
