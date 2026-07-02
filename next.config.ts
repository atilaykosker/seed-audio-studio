import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // App Router is default in Next 15. Keep the Vite src/ out of Next's page graph.
  pageExtensions: ['tsx', 'ts'],
}

export default nextConfig
