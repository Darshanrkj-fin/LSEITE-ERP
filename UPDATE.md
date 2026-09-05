# LSEITE ERP — UPDATE.md

## 1. Purpose

This document defines the required changes to the existing `LSEITE-ERP` project.

The target is **not** a public multi-tenant SaaS ERP.

The target is a **private ERP for one business owner**, covering:

- Cloud kitchen operations
- Consulting services
- Accounting
- Inventory
- Procurement
- Payroll and HR
- GST and TDS tracking
- R&D
- Banking and reconciliation
- Fixed assets
- Management reporting
- CA-ready year-end reporting
- Tally-compatible export where practical
- Secure worldwide access over the internet
- Lowest possible operating cost, with a free-tier-first deployment strategy

The system should support multiple branches/kitchens and multiple internal users, but all data belongs to the same business.

---

# 2. Product Direction

## Target operating model

```text
                    LSEITE BUSINESS ERP
                           |
             +-------------+-------------+
             |                           |
        CLOUD KITCHEN               CONSULTING
             |                           |
       Orders / POS                  Clients
       Recipes                      Projects
       Inventory                    Timesheets
       Production                   Expenses
       Wastage                      Billing
             |                           |
             +-------------+-------------+
                           |
                     ERP CORE
                           |
      +--------------------+--------------------+
      |          |          |         |         |
   Finance    Payroll    Banking   Tax/R&D   Reporting
      |
  General Ledger
      |
  +---+---------+---------+
  |             |         |
 P&L      Balance Sheet  Cash Flow
      |
   CA PACKAGE
```

---

# 3. Scope Decision

## Keep

The following existing areas are useful foundations and should be retained, improved and integrated:

- Double-entry accounting concepts
- Chart of accounts
- Journal/ledger concepts
- Financial statements
- GST calculation/reporting concepts
- Inventory
- Batches
- Recipes/BOM
- Production/manufacturing logic
- FEFO/expiry-aware stock usage
- R&D trials
- Quotes
- Custom orders
- Subscriptions
- Bank reconciliation
- Audit logging
- CA/report exports

## Remove from scope

Do not build these for the current product:

- Public multi-tenant SaaS architecture
- Tenant billing
- Customer subscription billing for ERP users
- Organization marketplace/onboarding
- Worldwide tax compliance in Version 1
- Enterprise-grade multi-tenant isolation
- Complex tenant-level administration
- Generic SaaS usage quotas

The application is for one business. It may have multiple branches, departments, users and business units.

---

# 4. Business Structure

The ERP should model the business as:

```text
Business
|
+-- Cloud Kitchen
|    |
|    +-- Branch / Kitchen
|    +-- Warehouse
|    +-- Recipes
|    +-- Production
|    +-- Orders
|    +-- Inventory
|    +-- Wastage
|    +-- Delivery Platforms
|
+-- Consulting
|    |
|    +-- Clients
|    +-- Projects
|    +-- Tasks
|    +-- Timesheets
|    +-- Expenses
|    +-- Invoices
|
+-- R&D
|
+-- Corporate / Administration
```

Add a `business_unit` or equivalent dimension so transactions can be reported by:

- Cloud Kitchen
- Consulting
- R&D
- Administration

The system must be able to produce separate and combined profitability.

---

# 5. Critical Architecture Rule

Every financial event must flow through the accounting engine.

Do not build separate financial calculations inside each module.

Preferred pattern:

```text
Business Event
      |
      v
Transaction Service
      |
      v
Validation
      |
      v
Accounting Posting
      |
      v
Journal Batch
      |
      +--> General Ledger
      +--> Tax
      +--> Inventory
      +--> AR/AP
      +--> Financial Reports
```

Examples:

```text
Kitchen sale
  -> invoice
  -> GST
  -> payment/receivable
  -> stock consumption
  -> COGS
  -> journal
```

```text
Consulting timesheet
  -> billable hours
  -> invoice
  -> GST
  -> receivable
  -> revenue
  -> project profitability
```

```text
Payroll run
  -> salary calculation
  -> statutory deductions
  -> payroll liability
  -> journal
  -> salary payment
```

---

# 6. Accounting Engine — Mandatory Changes

## 6.1 Keep double-entry accounting

Every posted transaction must satisfy:

```text
Total Debit = Total Credit
```

No exception.

## 6.2 Introduce journal batches

Use:

```text
journal_batches
journal_entries
journal_lines
```

Recommended fields:

- batch id
- source module
- source document type
- source document id
- accounting date
- posting date
- created by
- approved by
- posted by
- status
- reversal reference

## 6.3 Journal lifecycle

Use:

```text
Draft
  ->
Validated
  ->
Approved
  ->
Posted
```

Posted journals cannot be casually edited.

Corrections must use:

```text
Reversal
+
Corrected transaction
```

## 6.4 Restrict direct journal posting

Do not allow ordinary users to insert arbitrary balanced entries.

Manual journals should require:

- permission
- reason
- attachment/supporting document where applicable
- approval if configured
- audit log

## 6.5 Accounting period locking

Create:

```text
accounting_periods
```

Support:

- Open
- Under Review
- Closed
- Locked

Once a period is closed, normal users cannot post into it.

Only an authorized owner/accountant can reopen it.

---

# 7. Dimensions for Management Accounting

Journal lines should support dimensions such as:

- branch
- business unit
- department
- cost centre
- project
- product where relevant

This enables:

```text
Cloud Kitchen Profitability
Consulting Profitability
Branch Profitability
Project Profitability
R&D Cost
Department Cost
```

Example:

```text
Revenue
  Branch = Bangalore Kitchen
  Business Unit = Cloud Kitchen
  Cost Centre = Kitchen Operations
```

---

# 8. Chart of Accounts

Review the current chart of accounts and make it scalable.

Suggested structure:

```text
1000 Assets
1100 Cash
1200 Bank
1300 Accounts Receivable
1400 Inventory
1500 Prepaid Expenses
1600 Fixed Assets
1700 Accumulated Depreciation

2000 Liabilities
2100 Accounts Payable
2200 GST Payable
2300 TDS Payable
2400 Payroll Payable
2500 Other Current Liabilities
2600 Loans

3000 Equity

4000 Revenue
4100 Food Sales
4200 Consulting Revenue
4300 Other Revenue

5000 COGS
5100 Food Ingredients
5200 Packaging
5300 Other Direct Costs

6000 Operating Expenses
6100 Salaries
6200 Rent
6300 Utilities
6400 Marketing
6500 Software
6600 Travel
6700 Professional Fees
6800 R&D
6900 Other Expenses
```

The final account numbering can be adjusted to the business.

---

# 9. Inventory — Rebuild and Generalize

The current inventory/production foundation should be retained, but the data model needs to support a proper ERP inventory ledger.

## Add/support

- Products
- Raw materials
- Finished goods
- Services
- SKU
- Barcode
- Unit of measure
- UOM conversion
- Batch/lot
- Manufacture date
- Expiry date
- Supplier batch number
- Warehouse
- Storage location/bin
- Unit cost
- Reorder level
- Reorder quantity
- Preferred supplier
- Stock status

## Inventory transactions

Support:

- Opening stock
- Purchase receipt
- Purchase return
- Production consumption
- Production output
- Sales issue
- Sales return
- Stock transfer
- Wastage
- Spoilage
- Damage
- Internal consumption
- Stock adjustment
- Physical stock count

## Important change

Do not treat `opening_stock` as an editable product master field.

Opening inventory must be posted through an opening balance/stock transaction so that:

```text
Inventory quantity
=
Inventory ledger
=
Accounting balance
```

---

# 10. Inventory Costing

Support:

- FIFO
- Weighted-average costing

FEFO should be used for expiry-sensitive kitchen items when appropriate.

The system must distinguish:

```text
Physical stock quantity
Inventory valuation
COGS
```

Do not calculate COGS only from current stock values.

---

# 11. Recipes / BOM / Production

Keep the existing recipe/manufacturing concept.

Generalize it into:

```text
recipes
recipe_lines
production_orders
production_batches
production_consumption
production_output
```

Example:

```text
Chicken Biryani

Rice        250 g
Chicken     200 g
Oil          30 ml
Spices       20 g
Onion        50 g
Packaging     1 unit
```

When production/sale occurs, the system should be able to record the appropriate material consumption and finished output.

Recipe cost should support:

- material cost
- packaging cost
- labour allocation where desired
- wastage allowance
- total production cost
- estimated gross margin

---

# 12. Cloud Kitchen Order Management

Add a unified order engine.

Order sources:

- Manual order
- POS
- Website/order API
- CSV/Excel import
- Delivery platforms

All sources should normalize into one sales process.

```text
Order Source
   ->
Order
   ->
Sales Invoice
   ->
Payment / Receivable
   ->
Inventory
   ->
COGS
   ->
Accounting
```

Do not create separate accounting implementations per platform.

---

# 13. Delivery Platform Settlement/Reconciliation

Add support for platform economics.

Track:

- Gross order value
- Customer discount
- Platform discount
- Commission
- Taxes/fees
- Refund
- Other charges
- Settlement amount
- Settlement date

Example:

```text
Gross Orders                  100,000
- Discounts                    5,000
- Platform Commission         18,000
- Other Fees                   2,000
--------------------------------------
Expected Settlement            75,000
```

Then reconcile expected settlement against actual bank receipt.

This is critical for cloud-kitchen operations.

---

# 14. Wastage

Create a dedicated wastage transaction workflow.

Track:

- item
- batch
- quantity
- reason
- date
- branch
- user
- cost
- approval

Reasons:

- Spoilage
- Expired
- Damaged
- Production loss
- Preparation loss
- Quality rejection
- Other

Wastage must affect:

- inventory
- stock valuation
- expense/COGS as configured
- management reporting

---

# 15. Purchasing / Procurement

Create a full procurement flow:

```text
Purchase Request
     ->
Purchase Order
     ->
Goods Receipt
     ->
Purchase Invoice
     ->
Payment
```

Support:

- suppliers
- supplier prices
- payment terms
- tax
- purchase returns
- partial receipt
- partial billing
- outstanding payable

---

# 16. Party Model

Do not force a party to be only customer or vendor.

A single party may be:

- Customer
- Supplier
- Both

Use a flexible party-role model.

Support:

```text
parties
party_roles
party_contacts
party_addresses
party_tax_registrations
```

Store:

- legal name
- trade name
- tax registration
- billing address
- shipping/service address
- contact persons
- payment terms
- currency

---

# 17. Sales / Invoicing

Support:

- Quotes
- Sales orders
- Invoices
- Credit notes
- Debit notes
- Refunds
- Customer advances
- Receipts
- Recurring/subscription invoices where needed

Invoice status:

```text
Draft
Approved
Posted
Partially Paid
Paid
Overdue
Cancelled
```

Posted invoices should be immutable.

---

# 18. Credit/Debit Notes

Replace the current simplistic design with a reusable document model.

Support:

- multiple notes against an invoice
- line-level adjustments
- quantity adjustment
- price adjustment
- tax adjustment
- returns
- reason
- reference document
- accounting reversal/adjustment

---

# 19. Accounts Receivable

Add:

- customer ledger
- invoice aging
- overdue alerts
- receipts
- advances
- customer statements
- credit limits if desired

Aging:

```text
Current
1–30
31–60
61–90
90+
```

---

# 20. Accounts Payable

Add:

- supplier ledger
- bills
- debit notes
- supplier payments
- outstanding balance
- AP aging
- supplier statement

---

# 21. Consulting Module — Major New Module

This is a major addition.

## Client

Support:

- company/client master
- contacts
- contracts
- tax details
- billing terms

## Project

Support:

- project code
- client
- project manager
- start date
- end date
- budget
- status
- billing method
- billing rate
- cost centre

## Tasks

Support:

- task
- employee
- estimated hours
- actual hours
- billable/non-billable

## Timesheets

Fields:

- employee
- date
- project
- task
- hours
- billable?
- billing rate
- cost rate
- approval status

## Project expenses

Track:

- employee expense
- travel
- software
- contractor
- material
- miscellaneous

## Project profitability

Calculate:

```text
Project Revenue
- Project Costs
= Project Profit
```

Show:

- revenue
- labour cost
- direct expense
- indirect allocated cost if configured
- profit
- margin
- billable utilization

---

# 22. Expense Management

Add:

```text
expenses
expense_claims
expense_categories
employee_reimbursements
recurring_expenses
```

Workflow:

```text
Draft
  ->
Submitted
  ->
Approved
  ->
Posted
  ->
Paid
```

Support receipt attachments.

---

# 23. HR Module

Add:

- Departments
- Designations
- Employees
- Employee documents
- Joining/exit
- Attendance
- Leave
- Shifts
- Holidays
- Overtime
- Salary structures

Kitchen-specific shift support is important.

---

# 24. Payroll — Rebuild

The existing basic payroll approach must be replaced by a proper payroll engine.

## Employee master

Support:

- employee id
- name
- joining date
- employment status
- department
- designation
- branch
- bank account
- salary structure
- tax-related information
- statutory configuration

## Salary structure

Use configurable components rather than fixed columns.

Example:

```text
Earnings
- Basic
- HRA
- Allowances
- Overtime
- Incentives
- Bonus

Deductions
- Employee statutory deductions
- Tax withholding
- Advances
- Other deductions

Employer contributions
- Employer statutory components
```

## Payroll process

```text
Attendance
    ->
Leave
    ->
Overtime/Incentive
    ->
Salary Calculation
    ->
Statutory Calculation
    ->
Payroll Review
    ->
Payroll Approval
    ->
Payroll Posting
    ->
Payslip
    ->
Payment
```

## Payroll accounting

The payroll run must create accounting entries.

Example:

```text
Dr Salary Expense
Dr Employer Contribution Expense
    Cr Salary Payable
    Cr Statutory Payable
```

Actual account mapping should be configurable.

---

# 25. Indian Payroll Compliance

India should be the first payroll jurisdiction.

The system should support configurable statutory payroll components and rates.

Do not hard-code business logic into UI screens.

Keep a configuration layer so rates/rules can be updated without rewriting the payroll module.

The ERP should calculate and report payroll data, but final filing/compliance decisions should remain reviewable by the business/CA.

---

# 26. GST Module

The core accounting system should know about `tax`, not hard-coded GST-specific concepts everywhere.

Create a tax abstraction:

```text
tax_jurisdictions
tax_regimes
tax_codes
tax_rates
tax_transactions
```

India implementation:

```text
GST
+-- CGST
+-- SGST
+-- IGST
+-- UTGST if applicable
+-- Cess if applicable
+-- Exempt
+-- Nil-rated
+-- Non-GST
```

Support:

- sales tax
- purchase input tax
- credit/debit note tax
- reverse charge where applicable
- tax reconciliation
- tax period
- taxable value
- tax amount

Tax rules should have effective dates.

Never automatically change live tax rates based only on a web alert.

---

# 27. TDS Module

Create a first-class TDS module.

Track:

- vendor/payee
- payment
- section
- rate
- taxable base
- TDS amount
- liability
- payment/deposit
- reconciliation
- certificate/reference data

Accounting:

```text
Expense / Asset
    Cr Vendor Payable

Vendor Payment
    Dr Vendor Payable
    Cr Bank
    Cr TDS Payable
```

The exact posting logic should be configurable.

---

# 28. CA Reporting Package

This should become one of the flagship features.

Add a dedicated:

> `Generate CA Package`

workflow.

Input:

- Financial year
- Business unit
- Branch
- Date range
- optional report filters

Outputs:

1. Trial Balance
2. General Ledger
3. Profit & Loss
4. Balance Sheet
5. Cash Flow
6. Sales Register
7. Purchase Register
8. Expense Register
9. AR Aging
10. AP Aging
11. Customer Ledger
12. Supplier Ledger
13. Inventory Valuation
14. Stock Movement
15. Fixed Asset Register
16. Depreciation
17. GST Summary
18. Input Tax Summary
19. Output Tax Summary
20. TDS Summary
21. Payroll Summary
22. Bank Reconciliation
23. Journal Register
24. Audit Log
25. Master Data Export

Formats:

- Excel
- CSV
- PDF
- JSON where useful
- Tally-compatible XML/export mapping where practical

---

# 29. Tally Export

Because the CA may use Tally, add an export layer rather than hard-coding Tally formats into every module.

```text
ERP
  ->
Export Mapping Layer
  ->
Tally Export
```

Export masters such as:

- Ledgers
- Customers
- Suppliers
- Items
- Units
- Tax configuration where applicable

Export transactions such as:

- Sales
- Purchases
- Receipts
- Payments
- Journals
- Credit notes
- Debit notes

Validate the export before generating the final file.

---

# 30. Bank Module

Create a real bank-account module.

Do not store bank-account details directly in the company master as the primary model.

Add:

```text
bank_accounts
bank_transactions
bank_statement_imports
bank_reconciliations
bank_reconciliation_lines
```

Support:

- multiple bank accounts
- cash accounts
- UPI/online settlement accounts
- opening balances
- CSV/Excel statement import
- bank matching
- manual reconciliation
- unmatched transaction review

---

# 31. Bank Reconciliation

Workflow:

```text
Bank Statement
     ->
Import
     ->
Normalize
     ->
Auto Match
     ->
Manual Match
     ->
Reconciliation
     ->
Approved
```

Support:

- amount matching
- date tolerance
- reference matching
- duplicate detection
- bank charges
- missing ERP transaction
- missing bank transaction

---

# 32. Fixed Asset Module

Add:

```text
asset_categories
fixed_assets
asset_transactions
depreciation_runs
```

Support:

- capitalization
- depreciation
- transfer
- disposal
- impairment if needed
- accumulated depreciation
- asset register

Examples:

- Oven
- Refrigerator
- Laptop
- Office equipment
- Furniture
- Vehicle

---

# 33. R&D Module

Keep the current R&D concept but generalize it.

Structure:

```text
R&D Project
  ->
Experiment
  ->
Materials
  ->
Labour
  ->
Other Costs
  ->
Result
```

Support:

- food product R&D
- consulting research
- process improvement
- internal experiments

Each R&D project should have:

- budget
- actual cost
- materials
- labour
- external services
- documents
- experiment results

---

# 34. Document Management

Create a generic attachment system.

Attach documents to:

- invoices
- purchase bills
- expenses
- payroll
- projects
- R&D
- bank reconciliations
- fixed assets
- tax records
- contracts

Suggested table:

```text
attachments
  id
  entity_type
  entity_id
  file_name
  file_path
  mime_type
  uploaded_by
  created_at
```

Use private storage and permission-checked downloads.

---

# 35. Audit Logging

Audit at least these events:

- Login
- Logout
- User changes
- Permission changes
- Invoice creation
- Invoice cancellation
- Payment
- Receipt
- Journal posting
- Journal reversal
- Inventory adjustment
- Stock transfer
- Payroll posting
- Tax configuration change
- Bank reconciliation
- Export generation
- CA package generation
- Period close/reopen

Audit should record:

- actor
- timestamp
- action
- object type
- object id
- before value where appropriate
- after value where appropriate
- reason where required

---

# 36. User Roles

Keep roles simple because this is one business.

Suggested roles:

```text
OWNER
ACCOUNTANT
CA_AUDITOR
HR_PAYROLL
KITCHEN_MANAGER
INVENTORY_MANAGER
PROJECT_MANAGER
EMPLOYEE
VIEWER
```

Use real permission checks.

Examples:

```text
sales.create
sales.approve
sales.cancel

purchase.create
purchase.approve

inventory.adjust
inventory.transfer

payroll.prepare
payroll.approve

tax.view
tax.manage

reports.view
reports.export

users.manage
settings.manage
```

Database security must enforce permissions. UI hiding alone is not sufficient.

---

# 37. Authentication

Replace application-specific fake/first-user assumptions with proper authentication.

Preferred:

```text
Supabase Auth
   ->
User identity
   ->
Business membership/role
```

Even though this is one business, keep a `business_users` or membership table so roles are clean.

Do not place privileged Supabase service credentials in browser/frontend code.

---

# 38. Security Requirements

Minimum:

- Supabase Row Level Security
- Server-side privileged operations
- Role-based access
- Permission checks
- Session protection
- Secure file storage
- Audit logs
- Period locking
- Immutable posted documents
- Reversal instead of destructive accounting deletion
- Input validation
- Rate limiting for exposed APIs
- Backup strategy
- Error logging without leaking secrets

---

# 39. Multi-Branch Support

Support multiple branches/kitchens.

A branch can have:

- employees
- warehouse
- inventory
- sales
- production
- expenses
- bank account
- cost centre

Reports should be filterable by:

- branch
- business unit
- project
- date
- account

---

# 40. Financial Reporting

Required reports:

## Core

- Trial Balance
- General Ledger
- P&L
- Balance Sheet
- Cash Flow

## Working capital

- AR Aging
- AP Aging
- Customer Statements
- Supplier Statements

## Operations

- Inventory Valuation
- Stock Movement
- Stock Aging
- Wastage
- Recipe Costing
- Production Cost
- Product Margin

## Consulting

- Project Revenue
- Project Cost
- Project Profit
- Billable Hours
- Utilization
- Unbilled Work

## Payroll

- Payroll Register
- Salary Cost by Department
- Salary Cost by Branch
- Statutory Liability Summary

## Tax

- GST Summary
- Input Tax
- Output Tax
- TDS Summary
- Tax Reconciliation

---

# 41. Management Dashboard

The dashboard should answer:

### Finance

- Revenue
- Gross profit
- Net profit
- Cash
- Receivables
- Payables

### Kitchen

- Orders
- Sales
- Food cost %
- Wastage %
- Best sellers
- Highest-margin products
- Low stock
- Expiring stock

### Consulting

- Active projects
- Revenue
- Project margin
- Unbilled hours
- Outstanding invoices

### People

- Employees
- Payroll cost
- Attendance
- Overtime

### Compliance

- GST status
- TDS status
- Payroll status
- CA review status

---

# 42. What should be removed from the current project

Do not delete useful business features unnecessarily.

Remove/rewrite these architectural assumptions:

1. Single-role/single-company user design
2. Fake internal username/email assumptions
3. Direct unrestricted journal insertion
4. Editable `opening_stock` as a master field
5. Bank details embedded as primary company fields
6. Customer/vendor mutually-exclusive party model
7. Fixed simplistic payroll deductions
8. Overly narrow credit-note structure
9. One-bank-specific assumptions inside the core bank model
10. Tax rates hard-coded in UI/business modules

---

# 43. What should NOT be added right now

Do not over-engineer Version 1 with:

- multi-tenant customer SaaS billing
- global tax filing for every country
- complex CRM
- e-commerce platform
- advanced AI forecasting
- AI bookkeeping
- marketplace integrations unrelated to the business
- enterprise workflow engine
- microservices architecture

Prefer a modular monolith until scale requires otherwise.

---

# 44. Recommended Technical Architecture

## Frontend

- React / Next.js or the existing frontend framework if stable
- Responsive web application
- Mobile-friendly UI

## Backend

Prefer server-side API/service functions for:

- accounting posting
- tax calculation
- payroll calculation
- inventory posting
- exports
- privileged operations

## Database

PostgreSQL / Supabase PostgreSQL.

## Authentication

Supabase Auth.

## Storage

Supabase Storage or equivalent private object storage.

## Deployment

Prefer a Cloudflare-first deployment for the public application layer.

Example:

```text
Browser
   ->
Cloudflare Pages / Workers
   ->
Server/API layer
   ->
Supabase
      +-- PostgreSQL
      +-- Auth
      +-- Storage
```

This supports global access while minimizing initial infrastructure cost.

---

# 45. Free Hosting Strategy

Goal:

> Operate the private ERP with no mandatory paid subscription during the small-business/MVP stage.

Use free tiers where practical.

Important:

- Free tiers have limits.
- Free infrastructure is not guaranteed to remain sufficient as data grows.
- Database size, storage, traffic, backups and uptime requirements may eventually require paid infrastructure.
- Do not design the application assuming unlimited free resources.

The application should be efficient so it can remain in free tiers for as long as practical.

---

# 46. Source Repository Hygiene

Do not commit/package:

```text
node_modules/
dist/
build/
.env
.env.local
secrets
service-role keys
```

Keep:

```text
package.json
package-lock.json
source code
database migrations
configuration examples
documentation
```

A fresh clone should work with:

```bash
npm install
npm run lint
npm run build
```

---

# 47. Environment Variables

Create a clear `.env.example`.

Possible variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

Only expose variables prefixed as public where appropriate.

Never expose privileged service credentials to the browser.

---

# 48. Database Migration Strategy

Do not directly edit the live schema without versioned migrations.

Use:

```text
supabase/migrations/
```

or the project's existing migration approach.

Every change must be:

- repeatable
- versioned
- reviewable
- deployable
- reversible where practical

Create an initial cleanup migration before adding the new modules.

---

# 49. API Design

Group APIs by domain:

```text
/api/accounting/*
/api/sales/*
/api/purchases/*
/api/inventory/*
/api/production/*
/api/payroll/*
/api/hr/*
/api/projects/*
/api/rnd/*
/api/tax/*
/api/banking/*
/api/reports/*
/api/exports/*
```

Shared posting services should live below these domain APIs.

---

# 50. Recommended Development Order

## Phase 1 — Foundation

- Clean repository
- Remove `node_modules` from package/repository
- Verify clean install
- Verify build/lint
- Review environment variables
- Establish migration strategy
- Establish application error handling

## Phase 2 — Accounting Integrity

- Journal batches
- Journal lines
- Posting service
- Reversal
- Manual journal approval
- Accounting periods
- Period lock
- Opening balances
- AR/AP
- Accounting dimensions

## Phase 3 — Master Data

- Parties
- Products
- Units
- Tax codes
- Warehouses
- Employees
- Departments
- Chart of accounts

## Phase 4 — Sales & Purchasing

- Quotes
- Orders
- Invoices
- Credit/debit notes
- Purchase orders
- Goods receipts
- Purchase bills
- Payments/receipts
- AR/AP

## Phase 5 — Cloud Kitchen

- Kitchen order engine
- Recipe/BOM
- Production
- Inventory
- Batch
- Expiry
- FEFO
- Wastage
- Food costing
- Delivery settlement
- POS/import adapters

## Phase 6 — Payroll & HR

- Employees
- Attendance
- Leave
- Shifts
- Salary structures
- Payroll
- Statutory components
- Payslips
- Payroll journals

## Phase 7 — Consulting

- Clients
- Projects
- Tasks
- Timesheets
- Expenses
- Billing
- Project profitability

## Phase 8 — Tax & CA

- GST
- TDS
- Reconciliation
- CA package
- Excel/CSV/PDF
- Tally export layer

## Phase 9 — Banking & Fixed Assets

- Bank accounts
- Statement import
- Reconciliation
- Fixed assets
- Depreciation

## Phase 10 — R&D

- R&D projects
- Experiments
- Costs
- Results
- Attachments

## Phase 11 — Dashboard & Controls

- Management dashboards
- Alerts
- Low stock
- Expiry
- AR/AP overdue
- Tax due
- Payroll status
- CA review status

## Phase 12 — Production Hardening

- Security audit
- RLS review
- permission test
- transaction integrity tests
- export tests
- backup/recovery test
- performance test
- deployment test

---

# 51. Recommended Priority Order

For this business, priority is:

1. Accounting integrity
2. Sales/purchases
3. Inventory + recipes + production
4. GST/TDS + CA reporting
5. Payroll + HR
6. Banking/reconciliation
7. Consulting
8. Fixed assets
9. R&D
10. Dashboard/analytics/UI polish

Do not prioritize visual redesign above accounting correctness.

---

# 52. Minimum End-to-End Acceptance Tests

The project should not be considered complete until these scenarios work.

## Test 1 — Kitchen sale

```text
Create product
Create recipe
Create inventory
Receive ingredients
Produce product
Sell product
Invoice
Calculate tax
Reduce inventory
Calculate COGS
Post journal
Update P&L
```

## Test 2 — Consulting invoice

```text
Create client
Create project
Enter timesheet
Mark billable
Generate invoice
Calculate tax
Post receivable
Receive payment
Update project profit
```

## Test 3 — Purchase

```text
Create supplier
Purchase material
Receive material
Book supplier invoice
Record input tax
Increase inventory
Create payable
Make payment
Reconcile bank
```

## Test 4 — Payroll

```text
Create employee
Configure salary
Record attendance
Run payroll
Calculate statutory components
Approve payroll
Post journal
Generate payslip
Record payment
```

## Test 5 — Month close

```text
Reconcile bank
Review AR
Review AP
Review inventory
Review tax
Run payroll
Review journals
Lock accounting period
```

## Test 6 — Year-end CA package

```text
Select FY
Generate TB
Generate GL
Generate P&L
Generate Balance Sheet
Generate Cash Flow
Generate sales register
Generate purchase register
Generate GST/TDS
Generate payroll
Generate inventory
Generate fixed assets
Generate bank reconciliation
Generate audit log
Export package
```

---

# 53. Database Target Structure

Recommended high-level tables:

## Core

```text
business
business_units
branches
users
business_users
roles
permissions
role_permissions
```

## Parties

```text
parties
party_roles
party_contacts
party_addresses
party_tax_registrations
```

## Finance

```text
chart_of_accounts
accounting_periods
journal_batches
journal_entries
journal_lines
```

## Sales

```text
quotes
sales_orders
sales_invoices
sales_invoice_lines
credit_debit_notes
credit_debit_note_lines
receipts
customer_advances
```

## Purchasing

```text
purchase_requests
purchase_orders
goods_receipts
purchase_invoices
purchase_invoice_lines
supplier_payments
```

## Inventory

```text
products
product_variants
units
unit_conversions
warehouses
warehouse_locations
inventory_lots
inventory_movements
inventory_adjustments
stock_counts
stock_transfers
```

## Production

```text
recipes
recipe_lines
production_orders
production_batches
production_consumption
production_output
```

## Kitchen

```text
kitchen_orders
order_sources
delivery_platforms
delivery_settlements
platform_fees
wastage
```

## Consulting

```text
clients
projects
project_tasks
timesheets
project_expenses
project_budgets
```

## HR/Payroll

```text
departments
designations
employees
employee_documents
attendance
leave
shifts
holidays
salary_structures
salary_components
payroll_runs
payroll_lines
```

## Tax

```text
tax_jurisdictions
tax_regimes
tax_codes
tax_rates
tax_transactions
gst_transactions
tds_transactions
tax_reconciliations
```

## Banking

```text
bank_accounts
bank_transactions
bank_statement_imports
bank_reconciliations
bank_reconciliation_lines
```

## Fixed Assets

```text
asset_categories
fixed_assets
asset_transactions
depreciation_runs
```

## R&D

```text
rnd_projects
rnd_experiments
rnd_materials
rnd_labor
rnd_costs
rnd_results
```

## Documents and audit

```text
attachments
audit_logs
approval_logs
```

---

# 54. Important Accounting Controls

The system must enforce:

- Debit = Credit
- Posted transaction immutability
- Reversal instead of destructive edits
- Period locking
- Tax calculation consistency
- Inventory/accounting consistency
- Payment/invoice consistency
- Payroll/accounting consistency
- Audit logging
- Permission checks
- Source-document references

---

# 55. UX Rules

The interface should make accounting workflows simple.

Avoid forcing the owner to understand accounting journal mechanics for normal operations.

Example:

The owner should be able to click:

```text
New Kitchen Sale
```

instead of manually entering:

```text
Dr Cash
Cr Sales
Cr GST
Dr COGS
Cr Inventory
```

The ERP should generate those entries automatically.

Provide a detailed accounting view for accountant/CA users.

---

# 56. Error Handling

Business operations should fail safely.

Examples:

Do not allow:

- negative stock unless explicitly configured
- invoice posting without required data
- unbalanced journal
- posting to closed accounting period
- payroll without required employee configuration
- invalid tax combination
- duplicate settlement import
- duplicate invoice number where prohibited

All failures should return useful messages.

---

# 57. Testing Strategy

Add tests for:

## Accounting

- debit/credit balance
- posting
- reversal
- tax
- period lock

## Inventory

- stock in
- stock out
- batch
- FEFO
- wastage
- returns
- transfer

## Payroll

- salary
- attendance
- deductions
- statutory configuration
- journal posting

## Tax

- CGST/SGST/IGST
- input/output tax
- credit/debit notes
- TDS

## Reports

Verify that:

```text
Trial Balance
  ->
P&L
  ->
Balance Sheet
  ->
Cash Flow
```

are internally consistent.

---

# 58. Definition of Done

The ERP is ready for real business use only when:

- Accounting entries are double-entry and auditable
- P&L/Balance Sheet/Trial Balance reconcile
- Inventory matches accounting
- Payroll posts correctly
- GST/TDS data can be reconciled
- Bank reconciliation works
- Cloud kitchen orders flow into accounting
- Consulting projects track profitability
- R&D costs are captured
- CA package exports successfully
- User roles work
- RLS/security is tested
- Period locking works
- Backups/recovery have been tested
- Fresh deployment works from repository
- No secrets are stored in source
- No `node_modules`/build artifacts are required in the repository

---

# 59. Final Implementation Strategy

Do not rewrite everything.

Use the current `LSEITE-ERP` codebase as a foundation and perform a controlled architecture upgrade.

### Preserve

- Existing accounting concepts
- Inventory/production concepts
- Recipe system
- R&D concept
- Bank reconciliation concept
- Reports
- CA exports
- Existing useful UI components

### Refactor

- Authentication
- Roles/permissions
- Journal posting
- Inventory accounting
- Tax model
- Banking model
- Credit/debit notes
- Party model
- Payroll
- Branch/business-unit handling

### Add

- Consulting
- Expenses
- Full HR/payroll
- Cloud-kitchen order integration
- Delivery settlement reconciliation
- Fixed assets
- TDS
- Advanced CA package
- Tally export layer
- Generic attachments
- Accounting-period control
- Strong audit controls

### Remove

- SaaS/multi-tenant features
- unnecessary customer billing concepts
- unsafe direct accounting mutation paths
- simplistic master-field accounting assumptions

---

# 60. Final Product Definition

The finished system should behave as:

```text
                    LSEITE ERP
                       |
        +--------------+--------------+
        |                             |
   CLOUD KITCHEN                 CONSULTING
        |                             |
   Orders / POS                   Clients
   Inventory                      Projects
   Recipes                        Timesheets
   Production                     Expenses
   Wastage                        Billing
   Purchasing                     Payments
        |                             |
        +--------------+--------------+
                       |
                 COMMON ERP CORE
                       |
      +----------------+----------------+
      |         |       |        |      |
   Finance   Payroll   Tax     Banking  R&D
      |
   General Ledger
      |
   +--+---------+---------+
   |            |         |
  P&L      Balance Sheet  Cash Flow
   |
   +-----------------------+
   |
   CA / TALLY PACKAGE
   |
Excel / CSV / PDF / XML
```

The objective is a **single source of truth**:

> Enter a business transaction once, and let the ERP automatically update the operational records, inventory, tax, accounting, payroll, profitability and financial reports.

That should be the governing principle for all future development.
