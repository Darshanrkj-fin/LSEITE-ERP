import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const today = () => new Date().toISOString().slice(0, 10)
const emptyConsumption = { item_id: '', quantity: '' }

export function ProductionEntry() {
  const [finishedGoods, setFinishedGoods] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [customOrders, setCustomOrders] = useState([])

  const [finishedGoodId, setFinishedGoodId] = useState('')
  const [quantityProduced, setQuantityProduced] = useState('')
  const [productionDate, setProductionDate] = useState(today())
  const [expiryDate, setExpiryDate] = useState('')
  const [customOrderId, setCustomOrderId] = useState('')
  const [consumptions, setConsumptions] = useState([{ ...emptyConsumption }])

  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadOptions() {
      const [{ data }, { data: orderRows }] = await Promise.all([
        supabase.from('items').select('id, name, item_type').eq('type', 'good'),
        supabase.from('custom_orders').select('id, description, parties(name)').eq('status', 'open'),
      ])
      setFinishedGoods((data ?? []).filter((i) => i.item_type === 'finished_good'))
      setRawMaterials((data ?? []).filter((i) => i.item_type === 'raw_material'))
      setCustomOrders(orderRows ?? [])
    }
    loadOptions()
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
    const { data, error: postError } = await supabase.rpc('post_production_entry', {
      p_finished_good_item_id: finishedGoodId,
      p_quantity_produced: parseFloat(quantityProduced),
      p_production_date: productionDate,
      p_expiry_date: expiryDate,
      p_consumptions: payloadConsumptions,
      p_custom_order_id: customOrderId || null,
    })
    setSubmitting(false)

    if (postError) {
      setError(postError.message)
      return
    }
    setInfo(`Recorded: produced ${data.quantity_produced} unit(s) on ${data.production_date}.`)
    setQuantityProduced('')
    setExpiryDate('')
    setCustomOrderId('')
    setConsumptions([{ ...emptyConsumption }])
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold font-display text-ink">Production Entry</h1>
      <p className="mb-6 text-sm text-muted">
        Log one manufacturing batch: what was made, how much, and which raw materials went into it. There's no fixed
        recipe — enter whatever was actually consumed this time. Raw materials are drawn oldest-expiry-first from
        purchased stock, and their cost carries into this batch's finished-goods cost automatically.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Finished good produced</span>
          <select
            required
            value={finishedGoodId}
            onChange={(e) => setFinishedGoodId(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Select…</option>
            {finishedGoods.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Quantity produced</span>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={quantityProduced}
              onChange={(e) => setQuantityProduced(e.target.value)}
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Production date</span>
            <input
              type="date"
              required
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Expiry date</span>
            <input
              type="date"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Custom order (optional)</span>
            <select
              value={customOrderId}
              onChange={(e) => setCustomOrderId(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">None</option>
              {customOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.parties?.name} — {o.description || 'no description'}
                </option>
              ))}
            </select>
          </label>
        </div>

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

        {error && <p className="text-sm text-clay">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Recording…' : 'Record Production'}
        </button>
      </form>
    </div>
  )
}
