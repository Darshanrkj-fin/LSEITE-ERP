import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Check your .env file.'
  )
}

// Anon key only — this file is bundled into the client. The service role
// key must never appear here; it stays server-side (api/ functions) only.
export const supabase = createClient(url, anonKey)
