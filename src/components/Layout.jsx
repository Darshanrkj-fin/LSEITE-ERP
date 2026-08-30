import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

const NOTIFICATION_POLL_MS = 5 * 60 * 1000

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/company', label: 'Company Profile' },
  { to: '/chart-of-accounts', label: 'Chart of Accounts' },
  { to: '/items', label: 'Item Master' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/production-entry', label: 'Production Entry' },
  { to: '/rnd-trial', label: 'R&D Trial' },
  { to: '/custom-orders', label: 'Custom Orders' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/subscription-cycles', label: 'Subscription Cycles' },
  { to: '/parties', label: 'Party Master' },
  { to: '/tax-rates', label: 'Tax Rates' },
  { to: '/sales-invoices', label: 'Sales Invoices' },
  { to: '/purchase-invoices', label: 'Purchase Invoices' },
  { to: '/bank-transactions', label: 'Bank Transactions' },
  { to: '/reconciliation', label: 'Reconciliation' },
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
  { to: '/employees', label: 'Employee Master' },
  { to: '/run-payroll', label: 'Run Payroll' },
  { to: '/payroll-register', label: 'Payroll Register' },
  { to: '/gst-alerts', label: 'GST Alerts' },
  { to: '/audit-log', label: 'Audit Log', requiresAdmin: true },
  { to: '/manage-users', label: 'Manage Users', requiresManageUsers: true },
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

export function Layout() {
  const { username, profile, signOut } = useAuth()
  const visibleNavItems = navItems.filter((item) => {
    if (item.requiresManageUsers) return profile?.role === 'admin' && profile?.can_manage_users
    if (item.requiresAdmin) return profile?.role === 'admin'
    return true
  })

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-50 p-4">
        <div className="mb-6 flex items-center gap-2">
          <img src="/lseite-logo.jpg" alt="Lseite" className="h-8 w-8 rounded-full object-cover" />
          <span className="text-lg font-semibold text-slate-800">LSEITE ERP</span>
        </div>
        <nav className="space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <span className="text-sm text-slate-500">
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
