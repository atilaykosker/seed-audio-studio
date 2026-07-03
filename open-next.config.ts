import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Vite is gone; `pnpm build` is now `next build`, so the OpenNext default
// (`<packager> build`) is correct — no override needed.
export default defineCloudflareConfig()
