import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const today = () => new Date().toISOString().slice(0, 10)
const startOfMonth = () => today().slice(0, 8) + '01'
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`)

export function Dashboard() {
  const [salesThisMonth, setSalesThisMonth] = useState(null)
  const [lowStockItems, setLowStockItems] = useState([])
  const [cyclesAwaitingReview, setCyclesAwaitingReview] = useState([])
  const [expiringBatches, setExpiringBatches] = useState([])

  const [foodCostPct, setFoodCostPct] = useState(null)
  const [wastagePct, setWastagePct] = useState(null)

  const [portfolio, setPortfolio] = useState(null)

  const [activeEmployeeCount, setActiveEmployeeCount] = useState(0)
  const [presentToday, setPresentToday] = useState(0)
  const [payrollCostThisMonth, setPayrollCostThisMonth] = useState(0)
  const [payrollPaidCount, setPayrollPaidCount] = useState(0)

  const [gstOutputTax, setGstOutputTax] = useState(0)
  const [gstInputCredit, setGstInputCredit] = useState(0)
  const [tdsPendingCount, setTdsPendingCount] = useState(0)
  const [tdsPendingAmount, setTdsPendingAmount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [
        { data: invoices, error: invError },
        { data: stock },
        { data: cycles },
        { data: batches },
        { data: itemProfit },
        { data: wastageRows },
        { data: portfolioRows, error: portfolioError },
        { data: employees },
        { data: attendanceRows },
        { data: payrollRuns },
        { data: gstRows },
        { data: tdsRows },
      ] = await Promise.all([
        supabase
          .from('invoices')
          .select('grand_total')
          .eq('type', 'sales')
          .eq('status', 'posted')
          .gte('invoice_date', startOfMonth())
          .lte('invoice_date', today()),
        supabase.from('item_current_stock').select('*'),
        supabase
          .from('subscription_cycles')
          .select('id, cycle_date, subscriptions(parties(name))')
          .eq('status', 'draft')
          .order('cycle_date'),
        supabase
          .from('item_batch_status')
          .select('*')
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .limit(5),
        supabase.rpc('item_profitability', { p_from: startOfMonth(), p_to: today() }),
        supabase.from('wastage').select('cost').gte('wastage_date', startOfMonth()).lte('wastage_date', today()),
        supabase.rpc('project_portfolio_summary'),
        supabase.from('employees').select('id').eq('status', 'active'),
        supabase.from('attendance').select('status').eq('work_date', today()),
        supabase.from('payroll_runs').select('employee_id, net_pay').eq('run_month', startOfMonth()),
        supabase.rpc('gstr3b_summary', { p_from: startOfMonth(), p_to: today() }),
        supabase.rpc('tds_summary', { p_from: startOfMonth(), p_to: today() }),
      ])
      if (cancelled) return

      if (invError) setError(invError.message)
      else if (portfolioError) setError(portfolioError.message)

      setSalesThisMonth((invoices ?? []).reduce((sum, r) => sum + Number(r.grand_total), 0))
      setLowStockItems((stock ?? []).filter((r) => r.low_stock_threshold != null && r.current_stock <= r.low_stock_threshold))
      setCyclesAwaitingReview(cycles ?? [])
      setExpiringBatches(batches ?? [])

      const kitchenRevenue = (itemProfit ?? []).reduce((s, r) => s + Number(r.revenue), 0)
      const kitchenCogs = (itemProfit ?? []).reduce((s, r) => s + Number(r.cogs), 0)
      const wastageCost = (wastageRows ?? []).reduce((s, r) => s + Number(r.cost), 0)
      setFoodCostPct(kitchenRevenue > 0 ? (kitchenCogs / kitchenRevenue) * 100 : null)
      setWastagePct(kitchenCogs > 0 ? (wastageCost / kitchenCogs) * 100 : null)

      setPortfolio(portfolioRows?.[0] ?? null)

      setActiveEmployeeCount((employees ?? []).length)
      setPresentToday((attendanceRows ?? []).filter((r) => r.status === 'present').length)
      setPayrollCostThisMonth((payrollRuns ?? []).reduce((s, r) => s + Number(r.net_pay), 0))
      setPayrollPaidCount((payrollRuns ?? []).length)

      const output = (gstRows ?? [])
        .filter((r) => r.label.startsWith('Outward') || r.label.includes('sales credit notes'))
        .reduce((s, r) => s + Number(r.cgst) + Number(r.sgst) + Number(r.igst), 0)
      const input = (gstRows ?? [])
        .filter((r) => r.label.startsWith('Inward') || r.label.includes('purchase debit notes'))
        .reduce((s, r) => s + Number(r.cgst) + Number(r.sgst) + Number(r.igst), 0)
      setGstOutputTax(output)
      setGstInputCredit(input)

      const pendingTds = (tdsRows ?? []).filter((r) => !r.deposited_on)
      setTdsPendingCount(pendingTds.length)
      setTdsPendingAmount(pendingTds.reduce((s, r) => s + Number(r.tds_amount), 0))

      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="font-display mb-6 text-xl font-semibold text-ink">Dashboard</h1>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded border border-line bg-mist p-4">
          <p className="text-sm text-muted">Sales this month</p>
          <p className="text-2xl font-semibold text-ink">{salesThisMonth.toFixed(2)}</p>
        </div>
        <div className="rounded border border-line bg-mist p-4">
          <p className="text-sm text-muted">Low-stock items</p>
          <p className={`text-2xl font-semibold ${lowStockItems.length > 0 ? 'text-clay' : 'text-ink'}`}>
            {lowStockItems.length}
          </p>
        </div>
        <div className="rounded border border-line bg-mist p-4">
          <p className="text-sm text-muted">Subscription cycles awaiting review</p>
          <p className={`text-2xl font-semibold ${cyclesAwaitingReview.length > 0 ? 'text-gold' : 'text-ink'}`}>
            {cyclesAwaitingReview.length}
          </p>
        </div>
      </div>

      {/* Kitchen */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Kitchen</h2>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Food cost % (this month)</p>
            <p className="text-2xl font-semibold text-ink">{pct(foodCostPct)}</p>
            <p className="mt-1 text-xs text-muted">Cost of goods sold ÷ revenue, finished goods only.</p>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Wastage % of COGS (this month)</p>
            <p className={`text-2xl font-semibold ${wastagePct > 5 ? 'text-clay' : 'text-ink'}`}>{pct(wastagePct)}</p>
            <Link to="/wastage" className="mt-1 inline-block text-xs text-slate-600 hover:underline">
              View wastage log →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Low-stock items</h3>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted">Nothing below threshold.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lowStockItems.map((r) => (
                  <li key={r.item_id} className="flex justify-between border-b border-line py-1">
                    <span>{r.name}</span>
                    <span className="text-clay">
                      {r.current_stock} / {r.low_stock_threshold}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/inventory" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
              View inventory →
            </Link>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Batches nearest expiry</h3>
            {expiringBatches.length === 0 ? (
              <p className="text-sm text-muted">No batches tracked yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {expiringBatches.map((b) => (
                  <li key={b.batch_id} className="flex justify-between border-b border-line py-1">
                    <span>{b.item_name}</span>
                    <span className="text-muted">
                      {b.expiry_date ?? 'no expiry'} · {b.remaining_quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/batch-expiry-report" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
              View full batch/expiry report →
            </Link>
          </div>
        </div>
      </section>

      {/* Consulting */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Consulting</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Active projects</p>
            <p className="text-2xl font-semibold text-ink">{portfolio?.active_project_count ?? 0}</p>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Project margin (all-time)</p>
            <p className="text-2xl font-semibold text-ink">{pct(portfolio?.overall_margin_pct ?? null)}</p>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Unbilled hours</p>
            <p className={`text-2xl font-semibold ${(portfolio?.unbilled_hours ?? 0) > 0 ? 'text-gold' : 'text-ink'}`}>
              {portfolio?.unbilled_hours ?? 0}
            </p>
          </div>
        </div>
        <Link to="/projects" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
          View projects →
        </Link>
      </section>

      {/* People */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">People</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Active employees</p>
            <p className="text-2xl font-semibold text-ink">{activeEmployeeCount}</p>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Present today</p>
            <p className="text-2xl font-semibold text-ink">
              {presentToday} / {activeEmployeeCount}
            </p>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Payroll cost (this month)</p>
            <p className="text-2xl font-semibold text-ink">{payrollCostThisMonth.toFixed(2)}</p>
          </div>
        </div>
        <Link to="/attendance" className="mt-2 inline-block text-sm text-slate-600 hover:underline">
          View attendance →
        </Link>
      </section>

      {/* Compliance */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Compliance</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">GST this month (raw)</p>
            <p className="text-sm text-ink">
              Output {gstOutputTax.toFixed(2)} · Input {gstInputCredit.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-gold">Not netted — have your CA apply set-off rules before filing.</p>
            <Link to="/gst-summary" className="mt-1 inline-block text-xs text-slate-600 hover:underline">
              View GST summary →
            </Link>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">TDS pending deposit</p>
            <p className={`text-2xl font-semibold ${tdsPendingCount > 0 ? 'text-clay' : 'text-ink'}`}>
              {tdsPendingCount}
            </p>
            <p className="mt-1 text-xs text-muted">{tdsPendingAmount.toFixed(2)} not yet marked deposited.</p>
            <Link to="/tds-summary" className="mt-1 inline-block text-xs text-slate-600 hover:underline">
              View TDS summary →
            </Link>
          </div>
          <div className="rounded border border-line bg-mist p-4">
            <p className="text-sm text-muted">Payroll processed this month</p>
            <p className={`text-2xl font-semibold ${payrollPaidCount < activeEmployeeCount ? 'text-gold' : 'text-ink'}`}>
              {payrollPaidCount} / {activeEmployeeCount}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
