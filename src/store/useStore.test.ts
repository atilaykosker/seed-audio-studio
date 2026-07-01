import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './useStore'
import type { CharacterImage } from '@/lib/types'

const img: CharacterImage = { id: 'c1', name: 'A', url: 'https://a', source: 'minted', createdAt: 1 }

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ characterLibrary: [], brief: { ...useStore.getState().brief, withVideo: false } })
})

describe('character library', () => {
  it('defaults brief.withVideo to false', () => {
    expect(useStore.getState().brief.withVideo).toBe(false)
  })

  it('addCharacterImage persists to localStorage and dedupes by id', () => {
    useStore.getState().addCharacterImage(img)
    useStore.getState().addCharacterImage({ ...img, url: 'https://a2' })
    const lib = useStore.getState().characterLibrary
    expect(lib).toHaveLength(1)
    expect(lib[0].url).toBe('https://a2')
    expect(JSON.parse(localStorage.getItem('seed-audio-studio:characters')!)).toHaveLength(1)
  })

  it('removeCharacterImage removes by id', () => {
    useStore.getState().addCharacterImage(img)
    useStore.getState().removeCharacterImage('c1')
    expect(useStore.getState().characterLibrary).toHaveLength(0)
  })
})
