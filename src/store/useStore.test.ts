import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CharacterImage, Session } from '@/lib/types'
import type { SessionSummary } from '@/lib/api'

vi.mock('@/lib/api')

import * as api from '@/lib/api'
import { useStore } from './useStore'

const img: CharacterImage = { id: 'c1', name: 'A', url: 'https://a', source: 'minted', createdAt: 1 }

const summary: SessionSummary = {
  id: 's1',
  title: 'A run',
  createdAt: 1,
  updatedAt: 1,
  category: 'Podcast',
  videoModel: 'bytedance/seedance-2.0/image-to-video',
}

const fullSession: Session = {
  id: 's1',
  title: 'A run',
  createdAt: 1,
  updatedAt: 1,
  brief: { idea: 'first', durationSec: 40, language: 'EN', speakers: 'auto', genre: '', aspect: 'landscape', type: 'story', shotSec: 8 },
  plan: null,
  bioPlan: null,
  category: 'Podcast',
  clips: [{ id: 'c1', sceneId: 'sc1', title: 'S', speakers: [], prompt: 'p', status: 'done', videoUrl: 'https://a' }],
  videoModel: 'bytedance/seedance-2.0/image-to-video',
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    characterLibrary: [],
    sessions: [],
    activeSessionId: null,
    plan: null,
    bioPlan: null,
    category: null,
    clips: [],
    status: 'idle',
  })
})

describe('character library', () => {
  it('addCharacterImage dedupes by id (in-memory only)', () => {
    useStore.getState().addCharacterImage(img)
    useStore.getState().addCharacterImage({ ...img, url: 'https://a2' })
    const lib = useStore.getState().characterLibrary
    expect(lib).toHaveLength(1)
    expect(lib[0].url).toBe('https://a2')
  })

  it('removeCharacterImage calls api.deleteCharacter and removes by id', async () => {
    vi.mocked(api.deleteCharacter).mockResolvedValue(undefined)
    useStore.getState().addCharacterImage(img)
    await useStore.getState().removeCharacterImage('c1')
    expect(api.deleteCharacter).toHaveBeenCalledWith('c1')
    expect(useStore.getState().characterLibrary).toHaveLength(0)
  })

  it('clearCharacterLibrary deletes each character via the SDK then empties', async () => {
    vi.mocked(api.deleteCharacter).mockResolvedValue(undefined)
    useStore.getState().addCharacterImage(img)
    useStore.getState().addCharacterImage({ ...img, id: 'c2' })
    await useStore.getState().clearCharacterLibrary()
    expect(api.deleteCharacter).toHaveBeenCalledWith('c1')
    expect(api.deleteCharacter).toHaveBeenCalledWith('c2')
    expect(useStore.getState().characterLibrary).toHaveLength(0)
  })
})

describe('hydrate', () => {
  it('populates sessions and characterLibrary from the SDK', async () => {
    vi.mocked(api.listSessions).mockResolvedValue([summary])
    vi.mocked(api.listCharacters).mockResolvedValue([img])
    await useStore.getState().hydrate()
    expect(useStore.getState().sessions).toEqual([summary])
    expect(useStore.getState().characterLibrary).toEqual([img])
  })

  it('toasts on failure', async () => {
    vi.mocked(api.listSessions).mockRejectedValue(new Error('boom'))
    vi.mocked(api.listCharacters).mockResolvedValue([])
    await useStore.getState().hydrate()
    expect(useStore.getState().toasts.some((t) => t.kind === 'error')).toBe(true)
  })
})

describe('sessions', () => {
  it('loadSession calls api.getSession and sets state from it', async () => {
    vi.mocked(api.getSession).mockResolvedValue(fullSession)
    await useStore.getState().loadSession('s1')
    expect(api.getSession).toHaveBeenCalledWith('s1')
    const s = useStore.getState()
    expect(s.activeSessionId).toBe('s1')
    expect(s.brief.idea).toBe('first')
    expect(s.clips).toHaveLength(1)
    expect(s.status).toBe('done')
  })

  it('loadSession no-ops when the session is missing', async () => {
    vi.mocked(api.getSession).mockResolvedValue(null)
    await useStore.getState().loadSession('missing')
    expect(useStore.getState().activeSessionId).toBeNull()
  })

  it('renameSession calls api.renameSession and updates the in-memory title', async () => {
    vi.mocked(api.renameSession).mockResolvedValue(undefined)
    useStore.setState({ sessions: [summary] })
    await useStore.getState().renameSession('s1', '  ')
    expect(api.renameSession).toHaveBeenCalledWith('s1', 'Untitled')
    expect(useStore.getState().sessions[0].title).toBe('Untitled')

    await useStore.getState().renameSession('s1', 'My run')
    expect(api.renameSession).toHaveBeenCalledWith('s1', 'My run')
    expect(useStore.getState().sessions[0].title).toBe('My run')
  })

  it('deleteSession calls api.deleteSession and drops it from the list', async () => {
    vi.mocked(api.deleteSession).mockResolvedValue(undefined)
    useStore.setState({ sessions: [summary], activeSessionId: null })
    await useStore.getState().deleteSession('s1')
    expect(api.deleteSession).toHaveBeenCalledWith('s1')
    expect(useStore.getState().sessions).toHaveLength(0)
  })

  it('deleteSession clears results and activeSessionId when deleting the active session', async () => {
    vi.mocked(api.deleteSession).mockResolvedValue(undefined)
    useStore.setState({ sessions: [summary], activeSessionId: 's1', clips: fullSession.clips, status: 'done' })
    await useStore.getState().deleteSession('s1')
    expect(useStore.getState().activeSessionId).toBeNull()
    expect(useStore.getState().clips).toHaveLength(0)
    expect(useStore.getState().status).toBe('idle')
  })

  it('newSession resets local state without touching the SDK', () => {
    useStore.setState({ activeSessionId: 's1', clips: fullSession.clips, status: 'done' })
    useStore.getState().newSession()
    expect(useStore.getState().activeSessionId).toBeNull()
    expect(useStore.getState().clips).toHaveLength(0)
    expect(useStore.getState().status).toBe('idle')
  })
})

describe('removed BYOK actions', () => {
  it('no longer exposes key/keyDialogOpen/setKey/beginSession/saveActiveSession', () => {
    const s = useStore.getState() as unknown as Record<string, unknown>
    expect(s.key).toBeUndefined()
    expect(s.keyDialogOpen).toBeUndefined()
    expect(s.setKey).toBeUndefined()
    expect(s.setKeyDialogOpen).toBeUndefined()
    expect(s.beginSession).toBeUndefined()
    expect(s.saveActiveSession).toBeUndefined()
  })
})
