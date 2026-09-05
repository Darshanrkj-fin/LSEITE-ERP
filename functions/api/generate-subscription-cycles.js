import { createClient } from '@supabase/supabase-js'

// Same cron-protection pattern as functions/api/check-gst-notifications.js:
// the companion cron Worker sends `Authorization: Bearer <CRON_SECRET>`.
function isAuthorizedCronRequest(request, env) {
  const secret = env.CRON_SECRET
  return Boolean(secret) && request.headers.get('Authorization') === `Bearer ${secret}`
}

function addFrequency(dateStr, frequency) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// For every active subscription, ensures a draft cycle exists once its next
// billing date has arrived. Never touches a cycle staff already created
// ahead of time for that date (pre-selected items are left exactly as
// entered) — it only fills the gap when nothing exists yet, copying the
// previous cycle's items as a starting point. Never auto-finalizes
// anything — a draft is always reviewed by a person before it becomes a
// real invoice (finalize_subscription_cycle()).
export async function onRequest(context) {
  const { request, env } = context
  if (!isAuthorizedCronRequest(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const today = new Date().toISOString().slice(0, 10)

  const { data: subscriptions, error: subsError } = await supabase
    .from('subscriptions')
    .select('id, frequency, start_date')
    .eq('status', 'active')
  if (subsError) {
    return Response.json({ error: subsError.message }, { status: 500 })
  }

  const created = []
  const errors = []

  for (const sub of subscriptions ?? []) {
    try {
      const { data: lastCycle, error: lastCycleError } = await supabase
        .from('subscription_cycles')
        .select('id, cycle_date')
        .eq('subscription_id', sub.id)
        .order('cycle_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastCycleError) throw lastCycleError

      const nextDueDate = lastCycle ? addFrequency(lastCycle.cycle_date, sub.frequency) : sub.start_date
      if (nextDueDate > today) continue

      const { data: existing, error: existingError } = await supabase
        .from('subscription_cycles')
        .select('id')
        .eq('subscription_id', sub.id)
        .eq('cycle_date', nextDueDate)
        .maybeSingle()
      if (existingError) throw existingError
      if (existing) continue // staff (or an earlier run) already has a cycle for this date — leave it alone

      const { data: newCycle, error: insertError } = await supabase
        .from('subscription_cycles')
        .insert({ subscription_id: sub.id, cycle_date: nextDueDate, status: 'draft' })
        .select()
        .single()
      if (insertError) throw insertError

      if (lastCycle) {
        const { data: priorItems, error: priorItemsError } = await supabase
          .from('subscription_cycle_items')
          .select('item_id, quantity, rate')
          .eq('subscription_cycle_id', lastCycle.id)
        if (priorItemsError) throw priorItemsError
        if (priorItems?.length) {
          const { error: copyError } = await supabase
            .from('subscription_cycle_items')
            .insert(priorItems.map((i) => ({ ...i, subscription_cycle_id: newCycle.id })))
          if (copyError) throw copyError
        }
      }

      created.push({ subscriptionId: sub.id, cycleId: newCycle.id, cycleDate: nextDueDate })
    } catch (err) {
      errors.push({ subscriptionId: sub.id, error: err.message })
    }
  }

  return Response.json({ created, errors })
}
