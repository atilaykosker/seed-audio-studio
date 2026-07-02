import { describe, it, expect } from 'vitest'
import { makeS3 } from './s3'

const env = { AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secretsecretsecret', S3_BUCKET: 'my-bucket', S3_REGION: 'us-east-1' }

describe('putObject', () => {
  it('issues a signed PUT to the bucket/key with the body and content-type', async () => {
    let captured: Request | null = null
    const fetchImpl = async (req: Request) => { captured = req; return new Response(null, { status: 200 }) }
    const s3 = makeS3(env, fetchImpl as typeof fetch)
    await s3.putObject('sessions/s1/clips/c1.mp4', new Uint8Array([1, 2, 3]), 'video/mp4')
    expect(captured).not.toBeNull()
    const req = captured as unknown as Request
    expect(req.method).toBe('PUT')
    expect(req.url).toBe('https://my-bucket.s3.us-east-1.amazonaws.com/sessions/s1/clips/c1.mp4')
    expect(req.headers.get('content-type')).toBe('video/mp4')
    expect(req.headers.get('authorization')).toMatch(/AWS4-HMAC-SHA256/)
  })

  it('throws on a non-2xx response', async () => {
    const fetchImpl = async () => new Response('denied', { status: 403 })
    const s3 = makeS3(env, fetchImpl as typeof fetch)
    await expect(s3.putObject('k', new Uint8Array([1]), 'application/octet-stream')).rejects.toThrow(/403/)
  })
})

describe('presignGet', () => {
  it('returns a query-signed GET URL for the key', async () => {
    const s3 = makeS3(env)
    const url = await s3.presignGet('characters/i.png', 600)
    expect(url).toContain('https://my-bucket.s3.us-east-1.amazonaws.com/characters/i.png')
    expect(url).toMatch(/X-Amz-Signature=/)
    expect(url).toMatch(/X-Amz-Expires=600/)
  })
})
