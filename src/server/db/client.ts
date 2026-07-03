import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'

export function getDb(): D1Database {
  return getCloudflareContext().env.DB
}

/**
 * @deprecated Supabase has been removed in favor of Cloudflare D1 (see getDb()).
 * Temporary throwing stub kept only so route handlers not yet rewired (Task 6)
 * still typecheck/build. Do not call this.
 */
export function getSupabase(..._args: unknown[]): never {
  void _args
  throw new Error('getSupabase removed — use getDb() (D1)')
}
