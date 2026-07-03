import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Plan } from '@/lib/types'

vi.mock('@/lib/api')

import * as api from '@/lib/api'
import { useStore } from './useStore'

const plan: Plan = {
  category: 'Podcast',
  characters: [{ name: 'Ana', appearance: 'a woman', voice: 'warm' }],
  scenes: [{ id: 's1', title: 'Scene one', speakers: ['Ana'], visual: 'v', dialogue: 'Ana: "hi"' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    sessions: [],
    activeSessionId: null,
    clips: [],
    plan: null,
    bioPlan: null,
    category: null,
    characterLibrary: [],
    status: 'idle',
    brief: { ...useStore.getState().brief, idea: 'a rainy day', type: 'story' },
  })
})

describe('runStudio (story, happy path — statuses resolve done on first poll)', () => {
  it('creates a plan, mints the character, generates the scene, and marks the clip done', async () => {
    vi.mocked(api.createPlan).mockResolvedValue({
      sessionId: 'sess1',
      plan,
      bioPlan: undefined,
      category: 'Podcast',
      clips: [{ id: 'clip1', sceneId: 's1', title: 'Scene one', speakers: ['Ana'], prompt: 'v\nAna: "hi"', status: 'pending' }],
    })
    vi.mocked(api.generateCharacter).mockResolvedValue({ characterId: 'char1', requestId: 'r1' })
    vi.mocked(api.characterStatus).mockResolvedValue({ status: 'done', url: 'https://char.png' })
    vi.mocked(api.generateScene).mockResolvedValue({ requestId: 'r2' })
    vi.mocked(api.clipStatus).mockResolvedValue({ status: 'done', videoUrl: 'https://video' })
    vi.mocked(api.listSessions).mockResolvedValue([])
    vi.mocked(api.listCharacters).mockResolvedValue([])

    await useStore.getState().runStudio()

    expect(api.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ idea: 'a rainy day' }),
      expect.objectContaining({ model: expect.any(String), videoModel: expect.any(String) }),
    )
    expect(api.generateCharacter).toHaveBeenCalledWith(plan.characters[0])
    expect(api.generateScene).toHaveBeenCalledWith('sess1', 's1')

    const s = useStore.getState()
    expect(s.activeSessionId).toBe('sess1')
    expect(s.plan).toEqual(plan)
    expect(s.characterLibrary.some((c) => c.name === 'Ana' && c.url === 'https://char.png')).toBe(true)
    expect(s.clips[0].status).toBe('done')
    expect(s.clips[0].videoUrl).toBe('https://video')
    expect(s.status).toBe('done')
  })

  it('skips minting a character already present in the library (case-insensitive)', async () => {
    useStore.setState({
      characterLibrary: [{ id: 'existing', name: 'ana', url: 'https://existing', source: 'minted', createdAt: 1 }],
    })
    vi.mocked(api.createPlan).mockResolvedValue({
      sessionId: 'sess1',
      plan,
      bioPlan: undefined,
      category: 'Podcast',
      clips: [{ id: 'clip1', sceneId: 's1', title: 'Scene one', speakers: ['Ana'], prompt: 'v', status: 'pending' }],
    })
    vi.mocked(api.generateScene).mockResolvedValue({ requestId: 'r2' })
    vi.mocked(api.clipStatus).mockResolvedValue({ status: 'done', videoUrl: 'https://video' })
    vi.mocked(api.listSessions).mockResolvedValue([])
    vi.mocked(api.listCharacters).mockResolvedValue([])

    await useStore.getState().runStudio()

    expect(api.generateCharacter).not.toHaveBeenCalled()
  })
})

describe('runStudio (poll loop exercised — running then done)', () => {
  it('polls clipStatus until done, applying interim phase updates', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(api.createPlan).mockResolvedValue({
        sessionId: 'sess1',
        plan: { ...plan, characters: [] },
        bioPlan: undefined,
        category: 'Podcast',
        clips: [{ id: 'clip1', sceneId: 's1', title: 'Scene one', speakers: [], prompt: 'v', status: 'pending' }],
      })
      vi.mocked(api.generateScene).mockResolvedValue({ requestId: 'r2' })
      vi.mocked(api.clipStatus)
        .mockResolvedValueOnce({ status: 'running', phase: 'running' })
        .mockResolvedValueOnce({ status: 'done', videoUrl: 'https://video' })
      vi.mocked(api.listSessions).mockResolvedValue([])
      vi.mocked(api.listCharacters).mockResolvedValue([])

      const done = useStore.getState().runStudio()
      await vi.runAllTimersAsync()
      await done

      const s = useStore.getState()
      expect(api.clipStatus).toHaveBeenCalledTimes(2)
      expect(s.clips[0].status).toBe('done')
      expect(s.clips[0].videoUrl).toBe('https://video')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('regenScene', () => {
  it('resets the clip, calls generateScene + polls clipStatus, and marks it done', async () => {
    useStore.setState({
      activeSessionId: 'sess1',
      clips: [{ id: 'clip1', sceneId: 's1', title: 'Scene one', speakers: [], prompt: 'v', status: 'error', error: 'x' }],
    })
    vi.mocked(api.generateScene).mockResolvedValue({ requestId: 'r3' })
    vi.mocked(api.clipStatus).mockResolvedValue({ status: 'done', videoUrl: 'https://video2' })

    await useStore.getState().regenScene('s1')

    expect(api.generateScene).toHaveBeenCalledWith('sess1', 's1')
    expect(api.clipStatus).toHaveBeenCalledWith('clip1')
    const s = useStore.getState()
    expect(s.clips[0].status).toBe('done')
    expect(s.clips[0].videoUrl).toBe('https://video2')
    expect(s.clips[0].error).toBeUndefined()
  })

  it('no-ops when there is no active session or matching clip', async () => {
    useStore.setState({ activeSessionId: null, clips: [] })
    await useStore.getState().regenScene('missing')
    expect(api.generateScene).not.toHaveBeenCalled()
  })
})
