// src/server/auth/session.ts
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'bookticle_session'
const DEFAULT_TTL = 60 * 60 * 24 * 7 // 7 days

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signSession(secret: string, ttlSeconds: number = DEFAULT_TTL): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: 'app' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key(secret))
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  try {
    await jwtVerify(token, key(secret))
    return true
  } catch {
    return false
  }
}
