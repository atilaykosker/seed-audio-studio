import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'

export function getDb(): D1Database {
  return getCloudflareContext().env.DB
}
