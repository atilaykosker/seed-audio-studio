export interface AppEnv {
  FAL_KEY: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
  S3_REGION: string
}

const KEYS: (keyof AppEnv)[] = [
  'FAL_KEY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET', 'S3_REGION',
]

export function readEnv(): AppEnv {
  const out = {} as AppEnv
  for (const k of KEYS) {
    const v = process.env[k]
    if (!v) throw new Error(`Missing env: ${k}`)
    out[k] = v
  }
  return out
}
