import type { NextConfig } from 'next'
import { readFileSync } from 'node:fs'

const nextConfig: NextConfig = {
  // App Router is default in Next 15.
  pageExtensions: ['tsx', 'ts'],
}

export default nextConfig

// Make `pnpm dev` (next dev, plain Node) run the app the same as
// `pnpm cf:preview` (wrangler/workerd). Two things the Workers runtime gives us
// for free that next dev does not:
//  1) the Cloudflare bindings (D1 `env.DB`, reached via getCloudflareContext) —
//     wired by initOpenNextCloudflareForDev();
//  2) the `.dev.vars` values in `process.env` — the auth/fal/S3 routes read
//     `process.env.*`, which workerd populates from the worker env but next dev
//     does not (Next only auto-loads `.env*`). So load `.dev.vars` → process.env
//     here (dev only; no secret duplication — reads the existing gitignored file).
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
void initOpenNextCloudflareForDev()

if (process.env.NODE_ENV !== 'production') {
  try {
    for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    // no .dev.vars locally — fine (cf:preview/prod get env from the worker).
  }
}
