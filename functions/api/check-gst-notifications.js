import { createClient } from '@supabase/supabase-js'

// The companion cron Worker (see cron-worker/) sends
// `Authorization: Bearer <CRON_SECRET>` on the schedule it's configured
// with — this is what stops the public internet from triggering this
// endpoint directly.
function isAuthorizedCronRequest(request, env) {
  const secret = env.CRON_SECRET
  return Boolean(secret) && request.headers.get('Authorization') === `Bearer ${secret}`
}

// The CBIC site is a plain server-rendered page with no stable, documented
// structure to parse individual notifications out of — see the design
// discussion in this project's history. Instead of fragile scraping, this
// hashes the page's visible text and treats ANY change since the last
// check as the signal. It never claims to identify what changed, and it
// NEVER touches tax_rates — a human always reviews and edits that table
// manually (CLAUDE.md section 3).
function extractVisibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Web Crypto's digest() is native to the Workers runtime — no node:crypto
// polyfill needed. Returns an ArrayBuffer; hex-encode it by hand since
// there's no built-in helper for that on the Workers/browser crypto API.
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Surfaced via the header's notification bell (see Layout.jsx), not email
// — logging the change here is the only side effect of a positive check.
export async function onRequest(context) {
  const { request, env } = context
  if (!isAuthorizedCronRequest(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sourceUrl = env.GST_NOTIFICATION_SOURCE_URL
  if (!sourceUrl) {
    return Response.json({ error: 'GST_NOTIFICATION_SOURCE_URL is not configured' }, { status: 500 })
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let pageHash
  try {
    const pageResponse = await fetch(sourceUrl)
    if (!pageResponse.ok) {
      throw new Error(`HTTP ${pageResponse.status}`)
    }
    const html = await pageResponse.text()
    pageHash = await sha256Hex(extractVisibleText(html))
  } catch (err) {
    return Response.json({ error: `Failed to fetch GST notification source: ${err.message}` }, { status: 502 })
  }

  const { data: lastEntry, error: lastEntryError } = await supabase
    .from('gst_notification_log')
    .select('page_hash')
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastEntryError) {
    return Response.json({ error: lastEntryError.message }, { status: 500 })
  }

  // No prior check to compare against — this run just establishes the
  // baseline hash, it doesn't alert.
  const notificationFound = Boolean(lastEntry) && lastEntry.page_hash !== pageHash

  const { error: insertError } = await supabase
    .from('gst_notification_log')
    .insert({ notification_found: notificationFound, page_hash: pageHash })
  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  return Response.json({ notificationFound })
}
