import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

const NOTIFICATION_POLL_MS = 5 * 60 * 1000

// Grouped so a 35-item sidebar reads as sections to scan, not one long
// undifferentiated scroll — findability, not just page height.
const navGroups = [
  { label: null, items: [{ to: '/', label: 'Dashboard' }] },
  {
    label: 'Setup',
    items: [
      { to: '/company', label: 'Company Profile' },
      { to: '/chart-of-accounts', label: 'Chart of Accounts' },
      { to: '/tax-rates', label: 'Tax Rates' },
      { to: '/tds-rates', label: 'TDS Rates' },
    ],
  },
  {
    label: 'Masters',
    items: [
      { to: '/items', label: 'Item Master' },
      { to: '/parties', label: 'Party Master' },
      { to: '/employees', label: 'Employee Master' },
    ],
  },
  {
    label: 'Manufacturing',
    items: [
      { to: '/inventory', label: 'Inventory' },
      { to: '/production-entry', label: 'Production Entry' },
      { to: '/rnd-trial', label: 'R&D Trial' },
      { to: '/custom-orders', label: 'Custom Orders' },
      { to: '/wastage', label: 'Wastage' },
      { to: '/delivery-settlements', label: 'Delivery Settlements' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/quotes', label: 'Quotes' },
      { to: '/sales-invoices', label: 'Sales Invoices' },
      { to: '/subscriptions', label: 'Subscriptions' },
      { to: '/subscription-cycles', label: 'Subscription Cycles' },
    ],
  },
  {
    label: 'Consulting',
    items: [{ to: '/projects', label: 'Projects' }],
  },
  {
    label: 'Purchases & Banking',
    items: [
      { to: '/purchase-invoices', label: 'Purchase Invoices' },
      { to: '/bank-accounts', label: 'Bank Accounts' },
      { to: '/bank-transactions', label: 'Bank Transactions' },
      { to: '/reconciliation', label: 'Reconciliation' },
    ],
  },
  {
    label: 'Fixed Assets',
    items: [
      { to: '/asset-categories', label: 'Asset Categories' },
      { to: '/fixed-assets', label: 'Fixed Assets' },
      { to: '/depreciation-runs', label: 'Depreciation Runs' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/journal-register', label: 'Journal Register' },
      { to: '/ledger', label: 'Ledger' },
      { to: '/trial-balance', label: 'Trial Balance' },
      { to: '/profit-and-loss', label: 'Profit & Loss' },
      { to: '/balance-sheet', label: 'Balance Sheet' },
      { to: '/cash-flow', label: 'Cash Flow' },
      { to: '/fund-flow', label: 'Fund Flow' },
      { to: '/sales-register', label: 'Sales Register' },
      { to: '/gst-summary', label: 'GST Summary' },
      { to: '/item-profitability', label: 'Item Profitability' },
      { to: '/stock-valuation', label: 'Stock Valuation' },
      { to: '/batch-expiry-report', label: 'Batch / Expiry Report' },
      { to: '/ar-ap-aging', label: 'AR/AP Aging' },
      { to: '/party-statement', label: 'Party Statement' },
      { to: '/tds-summary', label: 'TDS Summary' },
    ],
  },
  {
    label: 'Payroll',
    items: [
      { to: '/run-payroll', label: 'Run Payroll' },
      { to: '/payroll-register', label: 'Payroll Register' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/gst-alerts', label: 'GST Alerts' },
      { to: '/accounting-periods', label: 'Accounting Periods' },
      { to: '/audit-log', label: 'Audit Log', requiresAdmin: true },
      { to: '/manage-users', label: 'Manage Users', requiresManageUsers: true },
    ],
  },
]

function NotificationBell() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadCount() {
      const { count: unreviewed } = await supabase
        .from('gst_notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('notification_found', true)
        .is('reviewed_at', null)
      if (!cancelled) setCount(unreviewed ?? 0)
    }
    loadCount()
    const interval = setInterval(loadCount, NOTIFICATION_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <NavLink
      to="/gst-alerts"
      className="relative rounded border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
      title="GST alerts"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.5h16a1 1 0 0 0 .7-1.8L19 16Z" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
    </NavLink>
  )
}

// Which group (by label) contains the current path — used to auto-open
// the relevant section and keep the rest collapsed to one line each.
function activeGroupLabel(pathname, groups) {
  for (const group of groups) {
    if (group.items.some((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))) {
      return group.label
    }
  }
  return null
}

export function Layout() {
  const { username, profile, signOut } = useAuth()
  const location = useLocation()
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.requiresManageUsers) return profile?.role === 'admin' && profile?.can_manage_users
        if (item.requiresAdmin) return profile?.role === 'admin'
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  const [openGroup, setOpenGroup] = useState(() => activeGroupLabel(location.pathname, visibleNavGroups))

  // Following a link (including via browser back/forward) should always
  // reveal the section it belongs to, even if the user had collapsed it.
  useEffect(() => {
    const label = activeGroupLabel(location.pathname, visibleNavGroups)
    if (label) setOpenGroup(label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 overflow-y-auto bg-ink p-4">
        <div className="mb-6 flex items-center gap-2">
          <img src="/lseite-logo.jpg" alt="Lseite" className="h-8 w-8 rounded-full object-cover" />
          <span className="font-display text-lg font-semibold text-white">LSEITE ERP</span>
        </div>
        <nav className="space-y-1">
          {visibleNavGroups.map((group) => {
            if (!group.label) {
              // The ungrouped top entry (Dashboard) — always visible, no toggle.
              return (
                <div key="top" className="mb-3 space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `block rounded px-3 py-1.5 text-sm ${
                          isActive
                            ? 'border-l-2 border-teal bg-white/10 text-white'
                            : 'text-white/70 hover:bg-white/10'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )
            }

            const isOpen = openGroup === group.label
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                  className="flex w-full items-center justify-between rounded px-3 py-1.5 text-xs font-semibold tracking-wide text-white/40 uppercase hover:text-white/70"
                >
                  {group.label}
                  <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {isOpen && (
                  <div className="mb-2 space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          `block rounded px-3 py-1.5 text-sm ${
                            isActive
                              ? 'border-l-2 border-teal bg-white/10 text-white'
                              : 'text-white/70 hover:bg-white/10'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-3">
          <span className="text-sm text-muted">
            Signed in as {username ?? '…'} ({profile?.role ?? '…'})
          </span>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <NavLink
              to="/change-password"
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              Change password
            </NavLink>
            <button
              onClick={signOut}
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
