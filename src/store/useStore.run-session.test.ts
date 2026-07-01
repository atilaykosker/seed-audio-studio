import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/services/studio/plan', () => ({
  makePlan: vi.fn(async () => ({
    category: 'Podcast',
    characters: [],
    scenes: [{ id: 's1', kind: 'T2A', title: 'Scene', speakers: [], prompt: 'p' }],
  })),
}))
vi.mock('@/services/studio/generate', () => ({
  generateFromPlan: vi.fn(async (_plan: unknown, _args: unknown, cb: { onScene?: (id: string, r: { url: string; durationSec: number }) => void }) => {
    cb.onScene?.('s1', { url: 'https://audio', durationSec: 5 })
  }),
  generateScene: vi.fn(),
}))

import { useStore } from './useStore'

beforeEach(() => {
  localStorage.clear()
  useStore.setState({
    key: 'id:hex',
    sessions: [],
    activeSessionId: null,
    clips: [],
    plan: null,
    brief: { ...useStore.getState().brief, idea: 'a rainy day', withVideo: false },
  })
})

describe('runStudio session persistence', () => {
  it('creates and persists a session titled from the brief with the generated clips', async () => {
    await useStore.getState().runStudio()
    const sessions = JSON.parse(localStorage.getItem('seed-audio-studio:sessions')!)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe('a rainy day')
    expect(sessions[0].category).toBe('Podcast')
    expect(sessions[0].clips.some((c: { url?: string }) => c.url === 'https://audio')).toBe(true)
  })

  it('reuses the active session instead of creating a second one on regenerate', async () => {
    await useStore.getState().runStudio()
    await useStore.getState().runStudio() // activeSessionId is now set → update in place
    const sessions = JSON.parse(localStorage.getItem('seed-audio-studio:sessions')!)
    expect(sessions).toHaveLength(1)
  })
})
