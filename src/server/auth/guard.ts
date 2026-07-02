// src/server/auth/guard.ts
const PUBLIC_EXACT = new Set(['/login', '/api/login', '/api/logout', '/favicon.ico'])

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (pathname.startsWith('/_next/')) return true
  return false
}
