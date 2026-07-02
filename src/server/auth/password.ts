const ITER = 100_000
const KEY_LEN = 32

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, KEY_LEN * 8)
  return toHex(bits)
}

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const saltStr = saltHex ?? toHex(salt.buffer)
  const hash = await derive(password, salt)
  return `${saltStr}:${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expected] = stored.split(':')
  if (!saltHex || !expected) return false
  const actual = await derive(password, fromHex(saltHex))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
