// A tiny standalone Cloudflare Worker whose only job is to fire the two
// scheduled Pages Functions on the crons configured in wrangler.toml.
// Cloudflare Pages Functions can't be triggered by Cron Triggers directly
// (that's a Workers-only feature) — this Worker is the trigger, not the
// logic; the actual work still lives in one place (functions/api/*.js).
//
// env.PAGES_URL is the deployed Pages project's origin (e.g.
// "https://lseite-erp.pages.dev"), set as a plain var below or in the
// Cloudflare dashboard. env.CRON_SECRET must be set as a *secret* (via
// `wrangler secret put CRON_SECRET`) to the exact same value configured on
// the Pages project — that's what the Pages Function checks against to
// reject unauthenticated callers.
const ENDPOINT_BY_CRON = {
  '0 6 * * 1': '/api/check-gst-notifications', // weekly
  '0 5 * * *': '/api/generate-subscription-cycles', // daily
}

export default {
  async scheduled(event, env) {
    const endpoint = ENDPOINT_BY_CRON[event.cron]
    if (!endpoint) {
      console.error(`No endpoint mapped for cron schedule "${event.cron}" — update ENDPOINT_BY_CRON.`)
      return
    }

    const response = await fetch(`${env.PAGES_URL}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    if (!response.ok) {
      console.error(`Cron ping to ${endpoint} failed: HTTP ${response.status} — ${await response.text().catch(() => '')}`)
    }
  },
}
