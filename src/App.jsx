import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { CompanyProfile } from './pages/CompanyProfile'
import { ChartOfAccounts } from './pages/ChartOfAccounts'
import { ItemMaster } from './pages/ItemMaster'
import { PartyMaster } from './pages/PartyMaster'
import { ChangePassword } from './pages/ChangePassword'
import { TaxRates } from './pages/TaxRates'
import { Quotes } from './pages/Quotes'
import { SalesInvoices } from './pages/SalesInvoices'
import { PurchaseInvoices } from './pages/PurchaseInvoices'
import { ManageUsers } from './pages/ManageUsers'
import { Inventory } from './pages/Inventory'
import { BankTransactions } from './pages/BankTransactions'
import { Reconciliation } from './pages/Reconciliation'
import { Ledger } from './pages/Ledger'
import { TrialBalance } from './pages/TrialBalance'
import { ProfitAndLoss } from './pages/ProfitAndLoss'
import { BalanceSheet } from './pages/BalanceSheet'
import { SalesRegister } from './pages/SalesRegister'
import { GstSummary } from './pages/GstSummary'
import { EmployeeMaster } from './pages/EmployeeMaster'
import { RunPayroll } from './pages/RunPayroll'
import { PayrollRegister } from './pages/PayrollRegister'
import { GstAlerts } from './pages/GstAlerts'
import { ProductionEntry } from './pages/ProductionEntry'
import { RndTrial } from './pages/RndTrial'
import { CustomOrders } from './pages/CustomOrders'
import { Subscriptions } from './pages/Subscriptions'
import { SubscriptionCycles } from './pages/SubscriptionCycles'
import { Dashboard } from './pages/Dashboard'
import { ItemProfitability } from './pages/ItemProfitability'
import { StockValuation } from './pages/StockValuation'
import { BatchExpiryReport } from './pages/BatchExpiryReport'
import { AuditLog } from './pages/AuditLog'
import { CashFlow } from './pages/CashFlow'
import { FundFlow } from './pages/FundFlow'
import { JournalRegister } from './pages/JournalRegister'
import { AccountingPeriods } from './pages/AccountingPeriods'
import { ArApAging } from './pages/ArApAging'
import { PartyStatement } from './pages/PartyStatement'
import { Wastage } from './pages/Wastage'
import { DeliverySettlements } from './pages/DeliverySettlements'
import { Projects } from './pages/Projects'
import { TdsRates } from './pages/TdsRates'
import { TdsSummary } from './pages/TdsSummary'
import { BankAccounts } from './pages/BankAccounts'
import { AssetCategories } from './pages/AssetCategories'
import { FixedAssets } from './pages/FixedAssets'
import { DepreciationRuns } from './pages/DepreciationRuns'
import { Departments } from './pages/Departments'
import { Attendance } from './pages/Attendance'
import { Leave } from './pages/Leave'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/company" element={<CompanyProfile />} />
        <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="/items" element={<ItemMaster />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/parties" element={<PartyMaster />} />
        <Route path="/tax-rates" element={<TaxRates />} />
        <Route path="/quotes/*" element={<Quotes />} />
        <Route path="/sales-invoices/*" element={<SalesInvoices />} />
        <Route path="/purchase-invoices/*" element={<PurchaseInvoices />} />
        <Route path="/bank-transactions" element={<BankTransactions />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/trial-balance" element={<TrialBalance />} />
        <Route path="/profit-and-loss" element={<ProfitAndLoss />} />
        <Route path="/balance-sheet" element={<BalanceSheet />} />
        <Route path="/sales-register" element={<SalesRegister />} />
        <Route path="/gst-summary" element={<GstSummary />} />
        <Route path="/employees" element={<EmployeeMaster />} />
        <Route path="/run-payroll" element={<RunPayroll />} />
        <Route path="/payroll-register" element={<PayrollRegister />} />
        <Route path="/gst-alerts" element={<GstAlerts />} />
        <Route path="/production-entry" element={<ProductionEntry />} />
        <Route path="/rnd-trial" element={<RndTrial />} />
        <Route path="/custom-orders/*" element={<CustomOrders />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/subscription-cycles/*" element={<SubscriptionCycles />} />
        <Route path="/item-profitability" element={<ItemProfitability />} />
        <Route path="/stock-valuation" element={<StockValuation />} />
        <Route path="/batch-expiry-report" element={<BatchExpiryReport />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/cash-flow" element={<CashFlow />} />
        <Route path="/fund-flow" element={<FundFlow />} />
        <Route path="/journal-register" element={<JournalRegister />} />
        <Route path="/accounting-periods" element={<AccountingPeriods />} />
        <Route path="/ar-ap-aging" element={<ArApAging />} />
        <Route path="/party-statement" element={<PartyStatement />} />
        <Route path="/wastage" element={<Wastage />} />
        <Route path="/delivery-settlements" element={<DeliverySettlements />} />
        <Route path="/projects/*" element={<Projects />} />
        <Route path="/tds-rates" element={<TdsRates />} />
        <Route path="/tds-summary" element={<TdsSummary />} />
        <Route path="/bank-accounts" element={<BankAccounts />} />
        <Route path="/asset-categories" element={<AssetCategories />} />
        <Route path="/fixed-assets" element={<FixedAssets />} />
        <Route path="/depreciation-runs" element={<DepreciationRuns />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/manage-users" element={<ManageUsers />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
