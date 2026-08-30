import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

// Vercel Cron Jobs automatically send `Authorization: Bearer <CRON_SECRET>`
// (sourced from the project's own CRON_SECRET env var) when invoking a
// scheduled function — this is the documented way to stop the public
// internet from triggering your cron endpoint directly.
function isAuthorizedCronRequest(req) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`
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

// Surfaced via the header's notification bell (see Layout.jsx), not email
// — logging the change here is the only side effect of a positive check.
export default async function handler(req, res) {
  if (!isAuthorizedCronRequest(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const sourceUrl = process.env.GST_NOTIFICATION_SOURCE_URL
  if (!sourceUrl) {
    res.status(500).json({ error: 'GST_NOTIFICATION_SOURCE_URL is not configured' })
    return
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let pageHash
  try {
    const pageResponse = await fetch(sourceUrl)
    if (!pageResponse.ok) {
      throw new Error(`HTTP ${pageResponse.status}`)
    }
    const html = await pageResponse.text()
    pageHash = createHash('sha256').update(extractVisibleText(html)).digest('hex')
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch GST notification source: ${err.message}` })
    return
  }

  const { data: lastEntry, error: lastEntryError } = await supabase
    .from('gst_notification_log')
    .select('page_hash')
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastEntryError) {
    res.status(500).json({ error: lastEntryError.message })
    return
  }

  // No prior check to compare against — this run just establishes the
  // baseline hash, it doesn't alert.
  const notificationFound = Boolean(lastEntry) && lastEntry.page_hash !== pageHash

  const { error: insertError } = await supabase
    .from('gst_notification_log')
    .insert({ notification_found: notificationFound, page_hash: pageHash })
  if (insertError) {
    res.status(500).json({ error: insertError.message })
    return
  }

  res.status(200).json({ notificationFound })
}
