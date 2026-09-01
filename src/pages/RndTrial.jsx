import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const today = () => new Date().toISOString().slice(0, 10)
const emptyConsumption = { item_id: '', quantity: '' }

export function RndTrial() {
  const [finishedGoods, setFinishedGoods] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])

  const [trialDate, setTrialDate] = useState(today())
  const [recipeDescription, setRecipeDescription] = useState('')
  const [resultingItemId, setResultingItemId] = useState('')
  const [outcomeNotes, setOutcomeNotes] = useState('')
  const [consumptions, setConsumptions] = useState([{ ...emptyConsumption }])

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadItems() {
      const { data } = await supabase.from('items').select('id, name, item_type').eq('type', 'good')
      setFinishedGoods((data ?? []).filter((i) => i.item_type === 'finished_good'))
      setRawMaterials((data ?? []).filter((i) => i.item_type === 'raw_material'))
    }
    loadItems()
  }, [])

  const updateConsumption = (index, field, value) => {
    setConsumptions((cs) => cs.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }
  const addConsumption = () => setConsumptions((cs) => [...cs, { ...emptyConsumption }])
  const removeConsumption = (index) => setConsumptions((cs) => cs.filter((_, i) => i !== index))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setInfo(null)

    const payloadConsumptions = consumptions
      .filter((c) => c.item_id && parseFloat(c.quantity) > 0)
      .map((c) => ({ item_id: c.item_id, quantity: parseFloat(c.quantity) }))

    if (payloadConsumptions.length === 0) {
      setError('Add at least one raw material consumed.')
      return
    }

    setSubmitting(true)
    const { data, error: postError } = await supabase.rpc('post_rnd_trial', {
      p_trial_date: trialDate,
      p_recipe_description: recipeDescription || null,
      p_resulting_item_id: resultingItemId || null,
      p_outcome_notes: outcomeNotes || null,
      p_consumptions: payloadConsumptions,
    })
    setSubmitting(false)

    if (postError) {
      setError(postError.message)
      return
    }
    setInfo(`Trial recorded for ${data.trial_date}.`)
    setRecipeDescription('')
    setResultingItemId('')
    setOutcomeNotes('')
    setConsumptions([{ ...emptyConsumption }])
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">R&amp;D Recipe Trial</h1>
      <p className="mb-6 text-sm text-muted">
        Log raw materials used to test a new recipe. Unlike a production entry, a trial's output is never added to
        sellable stock — its cost is expensed immediately as R&amp;D spend rather than transferred into finished-goods
        inventory. If a trial recipe gets adopted for real, record it as a normal production entry instead.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Trial date</span>
          <input
            type="date"
            required
            value={trialDate}
            onChange={(e) => setTrialDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Recipe description</span>
          <input
            placeholder="e.g. Zero-sugar ladoo, less cardamom, coconut base"
            value={recipeDescription}
            onChange={(e) => setRecipeDescription(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Aimed at finished good (optional)</span>
          <select
            value={resultingItemId}
            onChange={(e) => setResultingItemId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">None</option>
            {finishedGoods.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Raw materials consumed</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-muted">
                <th className="py-2 pr-4">Raw material</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {consumptions.map((c, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <select
                      value={c.item_id}
                      onChange={(e) => updateConsumption(i, 'item_id', e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="">Select…</option>
                      {rawMaterials.map((i2) => (
                        <option key={i2.id} value={i2.id}>
                          {i2.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={c.quantity}
                      onChange={(e) => updateConsumption(i, 'quantity', e.target.value)}
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {consumptions.length > 1 && (
                      <button type="button" onClick={() => removeConsumption(i)} className="text-sm text-clay hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addConsumption} className="mt-2 text-sm text-slate-600 hover:underline">
            + Add raw material
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Outcome notes</span>
          <textarea
            rows={3}
            placeholder="What happened? Would you adjust anything next time?"
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-clay">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Recording…' : 'Record Trial'}
        </button>
      </form>
    </div>
  )
}
