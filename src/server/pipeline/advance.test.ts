// src/server/pipeline/advance.test.ts
import { describe, it, expect } from 'vitest'
import { nextClipAction } from './advance'
import type { ClipRow } from '../db/rows'

const base: ClipRow = {
  id: 'c', session_id: 's', scene_id: 'sc', title: 'T', speakers: [], prompt: 'p',
  status: 'pending', phase: null, request_id: null, request_endpoint: null, image_key: null, video_key: null,
  duration_sec: null, error: null, created_at: 'x',
}

describe('nextClipAction', () => {
  it('done when video_key set', () => {
    expect(nextClipAction({ ...base, video_key: 'v.mp4', image_key: 'k.png' })).toBe('done')
  })
  it('poll-keyframe when request set, no image_key', () => {
    expect(nextClipAction({ ...base, request_id: 'r', status: 'running' })).toBe('poll-keyframe')
  })
  it('poll-video when image_key set, request set, no video_key', () => {
    expect(nextClipAction({ ...base, image_key: 'k.png', request_id: 'r2', status: 'running' })).toBe('poll-video')
  })
  it('submit-keyframe-pending when nothing started', () => {
    expect(nextClipAction(base)).toBe('submit-keyframe-pending')
  })
})
