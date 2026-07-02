import { AwsClient } from 'aws4fetch'

export interface S3Env {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
  S3_REGION: string
}

export interface S3 {
  putObject(key: string, body: ArrayBuffer | Uint8Array | Blob, contentType: string): Promise<void>
  presignGet(key: string, expiresSeconds?: number): Promise<string>
}

export function makeS3(env: S3Env, fetchImpl: typeof fetch = fetch): S3 {
  const client = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
    service: 's3',
  })
  const base = `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`

  return {
    async putObject(key, body, contentType) {
      const req = await client.sign(`${base}/${key}`, {
        method: 'PUT',
        body: body as BodyInit,
        headers: { 'content-type': contentType },
      })
      const res = await fetchImpl(req)
      if (!res.ok) throw new Error(`S3 putObject failed: ${res.status}`)
    },
    async presignGet(key, expiresSeconds = 3600) {
      const signed = await client.sign(`${base}/${key}?X-Amz-Expires=${expiresSeconds}`, {
        method: 'GET',
        aws: { signQuery: true },
      })
      return signed.url
    },
  }
}
