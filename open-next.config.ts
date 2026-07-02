import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// This repo also ships a Vite SPA whose `build` script (`vite build`) owns the
// root `pnpm build` command. OpenNext defaults to running `<packager> build`,
// which would build the Vite app instead of the Next app. Point it at the
// dedicated `next:build` script instead.
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'pnpm next:build',
}
