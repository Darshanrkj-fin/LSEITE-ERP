import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

const emptyLine = { item_id: '', quantity: '1', rate: '' }

export function QuoteForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [parties, setParties] = useState([])
  const [items, setItems] = useState([])
  const [companyStateCode, setCompanyStateCode] = useState(null)
  const [customOrders, setCustomOrders] = useState([])

  const [partyId, setPartyId] = useState('')
  const [quoteDate, setQuoteDate] = useState(today())
  const [validUntil, setValidUntil] = useState('')
  const [customOrderId, setCustomOrderId] = useState('')
  const [lines, setLines] = useState([{ ...emptyLine }])
  const [previews, setPreviews] = useState([])

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadOptions() {
      const [{ data: partyRows }, { data: itemRows }, { data: company }, { data: orderRows }] = await Promise.all([
        supabase.from('parties').select('id, name, state_code').eq('type', 'customer'),
        supabase.from('items').select('id, name, hsn_sac_code'),
        supabase.from('companies').select('state_code').eq('id', profile.company_id).single(),
        supabase.from('custom_orders').select('id, description, parties(name)').eq('status', 'open'),
      ])
      setParties(partyRows ?? [])
      setItems(itemRows ?? [])
      setCompanyStateCode(company?.state_code ?? null)
      setCustomOrders(orderRows ?? [])
    }
    loadOptions()
  }, [profile.company_id])

  useEffect(() => {
    async function recalculate() {
      const buyerParty = parties.find((p) => p.id === partyId)
      if (!buyerParty || !companyStateCode) {
        setPreviews(lines.map(() => null))
        return
      }

      const results = await Promise.all(
        lines.map(async (line) => {
          const item = items.find((i) => i.id === line.item_id)
          const quantity = parseFloat(line.quantity)
          const rate = parseFloat(line.rate)
          if (!item || !quantity || !rate || quantity <= 0 || rate < 0) return null

          const { data: taxRate, error: rateError } = await supabase.rpc('resolve_tax_rate', {
            p_hsn_sac_code: item.hsn_sac_code,
            p_as_of: quoteDate,
          })
          if (rateError || taxRate == null) return { error: `No tax rate for HSN ${item.hsn_sac_code}` }

          const taxable = Math.round(quantity * rate * 100) / 100
          const { data: split, error: splitError } = await supabase
            .rpc('calculate_gst_split', {
              p_seller_state_code: companyStateCode,
              p_buyer_state_code: buyerParty.state_code,
              p_taxable_value: taxable,
              p_tax_rate: taxRate,
            })
            .single()
          if (splitError) return { error: splitError.message }

          const lineTotal = taxable + split.cgst + split.sgst + split.igst
          return { taxRate, taxable, ...split, lineTotal }
        })
      )
      setPreviews(results)
    }
    recalculate()
  }, [lines, partyId, quoteDate, parties, items, companyStateCode])

  const updateLine = (index, field, value) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }

  const addLine = () => setLines((ls) => [...ls, { ...emptyLine }])
  const removeLine = (index) => setLines((ls) => ls.filter((_, i) => i !== index))

  const totals = previews.reduce(
    (acc, p) => {
      if (!p || p.error) return acc
      return {
        subtotal: acc.subtotal + p.taxable,
        cgst: acc.cgst + p.cgst,
        sgst: acc.sgst + p.sgst,
        igst: acc.igst + p.igst,
        grand: acc.grand + p.lineTotal,
      }
    },
    { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 }
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const payloadLines = lines
      .filter((l) => l.item_id && parseFloat(l.quantity) > 0 && parseFloat(l.rate) >= 0)
      .map((l) => ({ item_id: l.item_id, quantity: parseFloat(l.quantity), rate: parseFloat(l.rate) }))

    if (payloadLines.length === 0) {
      setError('Add at least one valid line item.')
      return
    }
    if (!partyId) {
      setError('Select a customer.')
      return
    }

    setSubmitting(true)
    const { data, error: postError } = await supabase.rpc('post_quote', {
      p_party_id: partyId,
      p_quote_date: quoteDate,
      p_line_items: payloadLines,
      p_valid_until: validUntil || null,
      p_custom_order_id: customOrderId || null,
    })
    setSubmitting(false)

    if (postError) {
      setError(postError.message)
      return
    }
    navigate(`/quotes/${data.id}`)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold text-slate-800">New Quote</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Customer</span>
            <select
              required
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Quote date</span>
            <input
              type="date"
              required
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Valid until (optional)</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Custom order (optional)</span>
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

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Quantity</th>
              <th className="py-2 pr-4">Rate</th>
              <th className="py-2 pr-4">Taxable</th>
              <th className="py-2 pr-4">CGST</th>
              <th className="py-2 pr-4">SGST</th>
              <th className="py-2 pr-4">IGST</th>
              <th className="py-2 pr-4">Line total</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const preview = previews[i]
              return (
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
                  <td className="py-2 pr-4">{preview && !preview.error ? preview.taxable.toFixed(2) : '—'}</td>
                  <td className="py-2 pr-4">{preview && !preview.error ? preview.cgst.toFixed(2) : '—'}</td>
                  <td className="py-2 pr-4">{preview && !preview.error ? preview.sgst.toFixed(2) : '—'}</td>
                  <td className="py-2 pr-4">{preview && !preview.error ? preview.igst.toFixed(2) : '—'}</td>
                  <td className="py-2 pr-4">{preview && !preview.error ? preview.lineTotal.toFixed(2) : preview?.error ?? '—'}</td>
                  <td className="py-2 pr-4">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-sm text-red-600 hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <button type="button" onClick={addLine} className="text-sm text-slate-600 hover:underline">
          + Add line
        </button>

        <div className="flex justify-end">
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 text-slate-500">Subtotal</td>
                <td className="py-1 text-right">{totals.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-slate-500">CGST</td>
                <td className="py-1 text-right">{totals.cgst.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-slate-500">SGST</td>
                <td className="py-1 text-right">{totals.sgst.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-slate-500">IGST</td>
                <td className="py-1 text-right">{totals.igst.toFixed(2)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-1 pr-4">Grand total</td>
                <td className="py-1 text-right">{totals.grand.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Quote'}
        </button>
      </form>
    </div>
  )
}
