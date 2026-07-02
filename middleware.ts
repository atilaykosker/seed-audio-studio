// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/src/server/auth/session'
import { isPublicPath } from '@/src/server/auth/guard'

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const secret = process.env.SESSION_SECRET ?? ''
  const ok = token ? await verifySession(token, secret) : false
  if (ok) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
