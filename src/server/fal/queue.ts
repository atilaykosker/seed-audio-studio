import { fal } from '@fal-ai/client'

export type Phase = 'queued' | 'running' | 'done'

export function configureFal(key: string): void {
  fal.config({ credentials: key })
}

export async function submit(endpointId: string, input: Record<string, unknown>): Promise<string> {
  const q = (await fal.queue.submit(endpointId, { input })) as { request_id: string }
  return q.request_id
}

export async function jobStatus(
  endpointId: string,
  requestId: string,
): Promise<{ raw: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'; phase: Phase }> {
  const s = (await fal.queue.status(endpointId, { requestId })) as { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' }
  const phase: Phase = s.status === 'IN_QUEUE' ? 'queued' : s.status === 'IN_PROGRESS' ? 'running' : 'done'
  return { raw: s.status, phase }
}

export async function jobResult<T>(endpointId: string, requestId: string): Promise<T> {
  const r = (await fal.queue.result(endpointId, { requestId })) as { data: T }
  return r.data
}

export async function downloadToBytes(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return { bytes: await res.arrayBuffer(), contentType }
}
