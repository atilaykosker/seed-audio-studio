import { verifyPassword } from './password'
import { signSession } from './session'

export async function attemptLogin(
  password: string,
  env: { APP_PASSWORD_HASH: string; SESSION_SECRET: string },
): Promise<string | null> {
  const ok = await verifyPassword(password, env.APP_PASSWORD_HASH)
  if (!ok) return null
  return signSession(env.SESSION_SECRET)
}
