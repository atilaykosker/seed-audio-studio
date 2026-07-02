// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { submitMock, statusMock, resultMock, configMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  statusMock: vi.fn(),
  resultMock: vi.fn(),
  configMock: vi.fn(),
}))
vi.mock('@fal-ai/client', () => ({
  fal: {
    config: configMock,
    queue: {
      submit: (...a: unknown[]) => submitMock(...a),
      status: (...a: unknown[]) => statusMock(...a),
      result: (...a: unknown[]) => resultMock(...a),
    },
  },
}))

import { configureFal, submit, jobStatus, jobResult } from './queue'

beforeEach(() => { submitMock.mockReset(); statusMock.mockReset(); resultMock.mockReset(); configMock.mockReset() })

describe('server fal queue', () => {
  it('configureFal sets credentials', () => {
    configureFal('k')
    expect(configMock).toHaveBeenCalledWith({ credentials: 'k' })
  })
  it('submit returns the request_id', async () => {
    submitMock.mockResolvedValue({ request_id: 'req-1' })
    expect(await submit('ep', { a: 1 })).toBe('req-1')
    expect(submitMock).toHaveBeenCalledWith('ep', { input: { a: 1 } })
  })
  it('jobStatus maps the three states to phases', async () => {
    statusMock.mockResolvedValueOnce({ status: 'IN_QUEUE' })
    expect((await jobStatus('ep', 'r')).phase).toBe('queued')
    statusMock.mockResolvedValueOnce({ status: 'IN_PROGRESS' })
    expect((await jobStatus('ep', 'r')).phase).toBe('running')
    statusMock.mockResolvedValueOnce({ status: 'COMPLETED' })
    expect((await jobStatus('ep', 'r')).phase).toBe('done')
  })
  it('jobResult returns .data', async () => {
    resultMock.mockResolvedValue({ data: { video: { url: 'u' } }, requestId: 'r' })
    expect(await jobResult('ep', 'r')).toEqual({ video: { url: 'u' } })
  })
})
