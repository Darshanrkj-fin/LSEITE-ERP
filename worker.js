// Single Worker entry point. This account's "lseite-erp" project turned
// out to be a plain Cloudflare Worker with a static-assets binding (the
// unified Workers+assets model), not a classic Pages project — confirmed
// via `wrangler deployments list --name lseite-erp` succeeding against
// the Workers API while `wrangler pages deploy` reported no such Pages
// project. functions/api/*.js keep their Pages-Functions-style
// onRequestGet/onRequestPost/onRequest exports unchanged (still valid,
// plain exported functions) — this file just dispatches to them by path
// instead of relying on Pages' file-based auto-routing, and adds a
// scheduled() handler so Cron Triggers work directly on this Worker (no
// separate companion Worker needed, unlike a classic Pages Function).
import * as invoicePdf from './functions/api/invoice-pdf.js'
import * as quotePdf from './functions/api/quote-pdf.js'
import * as payslipPdf from './functions/api/payslip-pdf.js'
import * as emailInvoicePdf from './functions/api/email-invoice-pdf.js'
import * as manageUser from './functions/api/manage-user.js'
import * as checkGstNotifications from './functions/api/check-gst-notifications.js'
import * as generateSubscriptionCycles from './functions/api/generate-subscription-cycles.js'

const ROUTES = {
  '/api/invoice-pdf': invoicePdf,
  '/api/quote-pdf': quotePdf,
  '/api/payslip-pdf': payslipPdf,
  '/api/email-invoice-pdf': emailInvoicePdf,
  '/api/manage-user': manageUser,
  '/api/check-gst-notifications': checkGstNotifications,
  '/api/generate-subscription-cycles': generateSubscriptionCycles,
}

// Same two schedules the old vercel.json crons used (and cron-worker/ used
// before this file replaced it): GST notification check (weekly, Monday
// 06:00 UTC), subscription-cycle generation (daily, 05:00 UTC).
const ROUTE_BY_CRON = {
  '0 6 * * 1': '/api/check-gst-notifications',
  '0 5 * * *': '/api/generate-subscription-cycles',
}

function methodHandlerName(method) {
  return `onRequest${method.charAt(0)}${method.slice(1).toLowerCase()}`
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const mod = ROUTES[url.pathname]
    if (!mod) return env.ASSETS.fetch(request)

    const handler = mod[methodHandlerName(request.method)] ?? mod.onRequest
    if (!handler) return Response.json({ error: 'Method not allowed' }, { status: 405 })
    return handler({ request, env, ctx })
  },

  async scheduled(event, env, ctx) {
    const path = ROUTE_BY_CRON[event.cron]
    if (!path) {
      console.error(`No route mapped for cron schedule "${event.cron}" — update ROUTE_BY_CRON.`)
      return
    }
    const mod = ROUTES[path]
    // Both cron endpoints export a single onRequest that checks the
    // Authorization header itself — build a synthetic authorized request
    // rather than forking that check for the scheduled path.
    const request = new Request(`https://internal${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const response = await mod.onRequest({ request, env, ctx })
    if (!response.ok) {
      console.error(`Scheduled run of ${path} failed: HTTP ${response.status} — ${await response.text().catch(() => '')}`)
    }
  },
}
