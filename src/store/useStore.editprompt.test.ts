import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './useStore'
import type { BiographyPlan, Clip, Plan } from '@/lib/types'

beforeEach(() => {
  useStore.setState({ plan: null, bioPlan: null, clips: [], activeSessionId: null })
})

describe('editClipPrompt', () => {
  it('story: sets scene.visual to the text, clears dialogue, and updates clip.prompt', () => {
    const plan: Plan = {
      category: 'Cartoon',
      characters: [],
      scenes: [{ id: 'sc1', title: 'S', speakers: [], visual: 'old visual', dialogue: 'A: "hi"' }],
    }
    const clips: Clip[] = [
      { id: 'c1', sceneId: 'sc1', title: 'S', speakers: [], prompt: 'old visual\nA: "hi"', status: 'done' },
    ]
    useStore.setState({ plan, clips })
    useStore.getState().editClipPrompt('sc1', 'a calm empty meadow, wide shot')
    const s = useStore.getState()
    expect(s.plan!.scenes[0].visual).toBe('a calm empty meadow, wide shot')
    expect(s.plan!.scenes[0].dialogue).toBe('')
    expect(s.clips[0].prompt).toBe('a calm empty meadow, wide shot')
  })

  it('biography: sets the matching shot.visual to the text and updates clip.prompt', () => {
    const bioPlan: BiographyPlan = {
      subject: 'Ada',
      style: 'painterly',
      stages: [{ id: 'st1', label: 'adult', appearance: 'a' }],
      pages: [{ id: 'p1', index: 1, narration: 'n', shots: [{ id: 'sh1', stageId: 'st1', visual: 'old shot' }] }],
    }
    const clips: Clip[] = [
      { id: 'c1', sceneId: 'sh1', title: 'Page 1 · Shot 1', speakers: [], prompt: 'old shot', status: 'done' },
    ]
    useStore.setState({ bioPlan, clips })
    useStore.getState().editClipPrompt('sh1', 'a bright study, candlelight, close-up')
    const s = useStore.getState()
    expect(s.bioPlan!.pages[0].shots[0].visual).toBe('a bright study, candlelight, close-up')
    expect(s.clips[0].prompt).toBe('a bright study, candlelight, close-up')
  })

  it('only touches the targeted clip/scene', () => {
    const plan: Plan = {
      category: 'C',
      characters: [],
      scenes: [
        { id: 'sc1', title: 'A', speakers: [], visual: 'v1', dialogue: 'd1' },
        { id: 'sc2', title: 'B', speakers: [], visual: 'v2', dialogue: 'd2' },
      ],
    }
    const clips: Clip[] = [
      { id: 'c1', sceneId: 'sc1', title: 'A', speakers: [], prompt: 'v1', status: 'done' },
      { id: 'c2', sceneId: 'sc2', title: 'B', speakers: [], prompt: 'v2', status: 'done' },
    ]
    useStore.setState({ plan, clips })
    useStore.getState().editClipPrompt('sc1', 'edited')
    const s = useStore.getState()
    expect(s.plan!.scenes[1].visual).toBe('v2')
    expect(s.plan!.scenes[1].dialogue).toBe('d2')
    expect(s.clips[1].prompt).toBe('v2')
  })
})
