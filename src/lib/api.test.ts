import { describe, it, expect, vi, afterEach } from 'vitest'
import * as api from './api'

function mockFetch(status: number, body: unknown, capture?: (url: string, init?: RequestInit) => void) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    capture?.(url, init)
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  })
}
afterEach(() => vi.restoreAllMocks())

describe('api client', () => {
  it('login posts the password with credentials included', async () => {
    let seenUrl = ''; let seenInit: RequestInit | undefined
    vi.stubGlobal('fetch', mockFetch(200, { ok: true }, (u, i) => { seenUrl = u; seenInit = i }))
    await api.login('pw')
    expect(seenUrl).toBe('/api/login')
    expect(seenInit?.method).toBe('POST')
    expect(seenInit?.credentials).toBe('include')
    expect(JSON.parse(String(seenInit?.body))).toEqual({ password: 'pw' })
  })
  it('login throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'invalid' }))
    await expect(api.login('bad')).rejects.toBeInstanceOf(api.ApiError)
  })
  it('listSessions returns the sessions array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { sessions: [{ id: 's1', title: 'T', createdAt: 1, updatedAt: 2, category: 'C', videoModel: 'm' }] }))
    const list = await api.listSessions()
    expect(list[0].id).toBe('s1')
  })
  it('getSession returns null on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    expect(await api.getSession('nope')).toBeNull()
  })
  it('clipStatus returns the parsed status/videoUrl', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'done', videoUrl: 'https://s3/x.mp4?sig' }))
    const s = await api.clipStatus('c1')
    expect(s.status).toBe('done'); expect(s.videoUrl).toContain('.mp4')
  })
})
