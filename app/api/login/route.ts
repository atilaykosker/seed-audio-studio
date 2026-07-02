import { NextRequest, NextResponse } from 'next/server'
import { attemptLogin } from '@/src/server/auth/login-handler'
import { SESSION_COOKIE } from '@/src/server/auth/session'

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  const token = password
    ? await attemptLogin(password, {
        APP_PASSWORD_HASH: process.env.APP_PASSWORD_HASH ?? '',
        SESSION_SECRET: process.env.SESSION_SECRET ?? '',
      })
    : null
  if (!token) return NextResponse.json({ error: 'invalid' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
