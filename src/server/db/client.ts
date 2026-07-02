import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface DbEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

export function getSupabase(env: DbEnv): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
