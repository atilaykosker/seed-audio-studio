import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './useStore'
import type { CharacterImage, Clip, Session } from '@/lib/types'

const img: CharacterImage = { id: 'c1', name: 'A', url: 'https://a', source: 'minted', createdAt: 1 }

const clip1: Clip = { id: 'c1', sceneId: 's1', title: 'S', speakers: [], prompt: 'p', status: 'done', videoUrl: 'https://a' }

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ characterLibrary: [] })
})

describe('character library', () => {
  it('addCharacterImage persists to localStorage and dedupes by id', () => {
    useStore.getState().addCharacterImage(img)
    useStore.getState().addCharacterImage({ ...img, url: 'https://a2' })
    const lib = useStore.getState().characterLibrary
    expect(lib).toHaveLength(1)
    expect(lib[0].url).toBe('https://a2')
    expect(JSON.parse(localStorage.getItem('bookticle-studio:characters')!)).toHaveLength(1)
  })

  it('removeCharacterImage removes by id', () => {
    useStore.getState().addCharacterImage(img)
    useStore.getState().removeCharacterImage('c1')
    expect(useStore.getState().characterLibrary).toHaveLength(0)
  })
})

describe('sessions', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ sessions: [], activeSessionId: null, brief: { ...useStore.getState().brief, idea: '' } })
  })

  it('beginSession creates + persists + activates a session (idempotent while active)', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'rainy day' } })
    useStore.getState().beginSession()
    const id = useStore.getState().activeSessionId
    expect(id).toBeTruthy()
    const lib = JSON.parse(localStorage.getItem('bookticle-studio:sessions')!) as Session[]
    expect(lib).toHaveLength(1)
    expect(lib[0].title).toBe('rainy day')
    expect(localStorage.getItem('bookticle-studio:activeSession')).toBe(id)
    useStore.getState().beginSession() // no-op while active
    expect(useStore.getState().sessions).toHaveLength(1)
  })

  it('saveActiveSession snapshots brief/plan/category/clips into the active session', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'a' } })
    useStore.getState().beginSession()
    useStore.setState({ category: 'Podcast', clips: [clip1] })
    useStore.getState().saveActiveSession()
    const lib = JSON.parse(localStorage.getItem('bookticle-studio:sessions')!) as Session[]
    expect(lib[0].category).toBe('Podcast')
    expect(lib[0].clips[0].videoUrl).toBe('https://a')
  })

  it('loadSession restores brief/plan/clips and marks status done when clips exist', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'first' } })
    useStore.getState().beginSession()
    useStore.setState({ clips: [clip1] })
    useStore.getState().saveActiveSession()
    const id = useStore.getState().activeSessionId!
    useStore.getState().newSession()
    expect(useStore.getState().clips).toHaveLength(0)
    useStore.getState().loadSession(id)
    expect(useStore.getState().brief.idea).toBe('first')
    expect(useStore.getState().clips).toHaveLength(1)
    expect(useStore.getState().status).toBe('done')
  })

  it('renameSession updates the title (Untitled on empty)', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'x' } })
    useStore.getState().beginSession()
    const id = useStore.getState().activeSessionId!
    useStore.getState().renameSession(id, '  ')
    expect(useStore.getState().sessions[0].title).toBe('Untitled')
    useStore.getState().renameSession(id, 'My run')
    expect(useStore.getState().sessions[0].title).toBe('My run')
  })

  it('deleteSession removes it; deleting the active one resets to a clean state', () => {
    useStore.setState({ brief: { ...useStore.getState().brief, idea: 'x' } })
    useStore.getState().beginSession()
    const id = useStore.getState().activeSessionId!
    useStore.getState().deleteSession(id)
    expect(useStore.getState().sessions).toHaveLength(0)
    expect(useStore.getState().activeSessionId).toBeNull()
    expect(useStore.getState().clips).toHaveLength(0)
    expect(localStorage.getItem('bookticle-studio:activeSession')).toBeNull()
  })
})
