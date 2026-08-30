# CLAUDE.md — Working Rules for This Project

This file guides Claude Code while building this software. Read `ROADMAP.md` first for the full plan — this file is about *how* to build it, not *what* to build.

## 1. Project Identity
This is a GST-compliant company finance system: invoicing, inventory, bank reconciliation, core accounting reports, payroll, and GST summary reports. It is for one company's internal use (multi-branch ready in schema, not in active use yet).

Stack: React + Tailwind (frontend), Vercel Serverless Functions (backend), Supabase/Postgres (database + auth). No other services. No paid APIs anywhere in current scope.

## 2. Stay on the Roadmap
- Always check `ROADMAP.md` before starting new work. Build phases **in order** — do not jump ahead to Payroll or GST alerts before Invoicing, Inventory, and Reports are working.
- If a request seems to fall outside the current phase, say so explicitly before proceeding, and ask whether to proceed anyway or stick to the current phase.
- Do not introduce new tools, services, or paid dependencies without flagging it first. This project is free-tier only unless explicitly told otherwise.

## 3. Non-Negotiable Accounting Rules
- **Every transaction must be double-entry**: total debits = total credits, always. Never post a one-sided journal entry.
- **GST tax rates live in the `tax_rates` database table, never hardcoded** in application code. Calculation logic reads from this table.
- **CGST+SGST vs IGST logic**: compare buyer state_code vs seller (company) state_code. Same state → CGST+SGST split. Different state → IGST. This must be centralized in one function, not duplicated across invoice types.
- **Never auto-apply a GST rate change.** The notification checker (Phase 8) only alerts a human. Any code that modifies `tax_rates` automatically without a user action is a bug, not a feature.
- Invoices, once finalized/posted, should not silently change historical tax amounts if a rate is later updated — use `effective_from`/`effective_to` on `tax_rates` so historical invoices remain accurate.

## 4. Security Rules
- All secrets go in `.env`, never hardcoded, never committed. Confirm `.env` is in `.gitignore` before the first commit.
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never expose it in frontend code or client bundles.
- Validate all financial inputs server-side (amounts, dates, GSTIN format) even if also validated client-side. Never trust client input for tax calculations.

## 5. Code Style — Keep It Minimal
This project uses the **ponytail** philosophy: don't write code that doesn't need to exist.
- Before adding a library, check: does the stdlib, a native browser/Node feature, or an already-installed dependency solve this? Prefer that over installing something new.
- Don't build abstractions, config systems, or generic frameworks for problems that only have one instance right now. Solve today's requirement; don't speculate.
- Exceptions where minimalism does NOT apply — always do these properly, never cut corners: input validation at trust boundaries, financial calculations (GST, ledger posting), data-loss prevention (e.g. confirmations before destructive actions), and access control.
- If unsure whether something is over-engineered, ask before building it.

## 6. When Stuck or Ambiguous
- If a requirement is unclear (e.g., "how should partial payments against an invoice work?"), ask a specific question rather than guessing and building the wrong thing.
- If you notice the schema in `ROADMAP.md` doesn't fit something new that's come up, flag the mismatch and propose a schema change rather than working around it with a hack.

## 7. Testing Expectations
- For financial calculations (GST split, ledger posting, trial balance totals), write a few test cases with known correct outputs before considering that piece done. A miscalculated GST amount is a compliance issue, not just a bug.
- After each phase in `ROADMAP.md`, do a quick self-check: does trial balance still balance? Do invoice PDFs match the ledger entries they generated?

## 8. Compliance Reminders (flag, don't decide)
You are not a chartered accountant. When something touches actual compliance judgment (e.g., "is this transaction taxable", "does this need reverse charge", "is this employee's PF applicable") — implement the mechanism, but flag to the user that a CA should confirm the rule, rather than deciding it yourself.
