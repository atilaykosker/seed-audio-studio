import { create } from 'zustand'
import { uid } from '@/lib/utils'
import { mapFalError } from '@/services/fal/errors'
import { DEFAULT_MODEL } from '@/services/fal/client'
import { makePlan } from '@/services/studio/plan'
import { generateFromPlan, generateScene } from '@/services/studio/generate'
import { sceneKeyframe } from '@/services/studio/image'
import { generateSceneVideo } from '@/services/studio/video'
import type { Brief, Clip, CharacterImage, Plan, StudioStatus, Voice } from '@/lib/types'

const LIB_KEY = 'seed-audio-studio:library'
const MODEL_KEY = 'seed-audio-studio:model'
const CHAR_KEY = 'seed-audio-studio:characters'

export interface Toast {
  id: string
  kind: 'info' | 'error' | 'success'
  title: string
  message?: string
}

function loadLibrary(): Voice[] {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) ?? '[]') as Voice[]
  } catch {
    return []
  }
}
function saveLibrary(v: Voice[]) {
  localStorage.setItem(LIB_KEY, JSON.stringify(v))
}

function loadCharacterLibrary(): CharacterImage[] {
  try {
    return JSON.parse(localStorage.getItem(CHAR_KEY) ?? '[]') as CharacterImage[]
  } catch {
    return []
  }
}
function saveCharacterLibrary(v: CharacterImage[]) {
  localStorage.setItem(CHAR_KEY, JSON.stringify(v))
}

const DEFAULT_BRIEF: Brief = {
  idea: '',
  durationSec: 40,
  language: 'EN',
  speakers: 'auto',
  genre: '',
  voiceIds: [],
  withVideo: false,
}

interface Store {
  key: string | null
  keyDialogOpen: boolean
  toasts: Toast[]

  model: string
  brief: Brief
  library: Voice[]
  characterLibrary: CharacterImage[]

  plan: Plan | null
  category: string | null
  clips: Clip[]
  status: StudioStatus
  currentStep: string | null

  // key + toasts (consumed by KeyBubble/Toaster)
  setKey: (k: string | null) => void
  setKeyDialogOpen: (v: boolean) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  setModel: (m: string) => void
  setBrief: (patch: Partial<Brief>) => void

  addVoice: (v: Voice) => void
  removeVoice: (id: string) => void
  clearLibrary: () => void

  addCharacterImage: (img: CharacterImage) => void
  removeCharacterImage: (id: string) => void
  clearCharacterLibrary: () => void

  clearResults: () => void
  runStudio: () => Promise<void>
  regenScene: (sceneId: string) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  key: null,
  keyDialogOpen: false,
  toasts: [],

  model: localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL,
  brief: DEFAULT_BRIEF,
  library: loadLibrary(),
  characterLibrary: loadCharacterLibrary(),

  plan: null,
  category: null,
  clips: [],
  status: 'idle',
  currentStep: null,

  setKey: (k) => set({ key: k }),
  setKeyDialogOpen: (v) => set({ keyDialogOpen: v }),
  toast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid() }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setModel: (m) => {
    localStorage.setItem(MODEL_KEY, m)
    set({ model: m })
  },
  setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),

  addVoice: (v) =>
    set((s) => {
      const next = [v, ...s.library.filter((x) => x.id !== v.id)]
      saveLibrary(next)
      return { library: next }
    }),
  removeVoice: (id) =>
    set((s) => {
      const next = s.library.filter((x) => x.id !== id)
      saveLibrary(next)
      return { library: next }
    }),
  clearLibrary: () => {
    saveLibrary([])
    set({ library: [] })
  },

  addCharacterImage: (img) =>
    set((s) => {
      const next = [img, ...s.characterLibrary.filter((x) => x.id !== img.id)]
      saveCharacterLibrary(next)
      return { characterLibrary: next }
    }),
  removeCharacterImage: (id) =>
    set((s) => {
      const next = s.characterLibrary.filter((x) => x.id !== id)
      saveCharacterLibrary(next)
      return { characterLibrary: next }
    }),
  clearCharacterLibrary: () => {
    saveCharacterLibrary([])
    set({ characterLibrary: [] })
  },

  clearResults: () => set({ plan: null, category: null, clips: [], status: 'idle', currentStep: null }),

  runStudio: async () => {
    const { key, brief, model } = get()
    if (!key) {
      set({ keyDialogOpen: true })
      return
    }
    if (!brief.idea.trim()) {
      get().toast({ kind: 'error', title: 'Add a brief', message: 'Describe the scene you want to generate.' })
      return
    }
    set({ status: 'planning', currentStep: 'Planning scene…', plan: null, clips: [] })
    const provided = get().library.filter((v) => brief.voiceIds.includes(v.id))
    let plan: Plan
    try {
      plan = await makePlan(brief, model, provided)
    } catch (e) {
      const fe = mapFalError(e)
      set({ status: 'error', currentStep: null })
      get().toast({ kind: 'error', title: fe.title, message: fe.message })
      return
    }

    const clips: Clip[] = plan.scenes.map((sc) => ({
      id: uid(),
      sceneId: sc.id,
      title: sc.title,
      kind: sc.kind,
      speakers: sc.speakers,
      prompt: sc.prompt,
      status: 'pending',
    }))
    set({ plan, category: plan.category, clips, status: 'generating' })

    const patchClipByScene = (sceneId: string, patch: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...patch } : c)) }))

    await generateFromPlan(
      plan,
      { library: get().library, characterLibrary: get().characterLibrary, withVideo: brief.withVideo },
      {
        onMintStart: (name) => set({ currentStep: `Minting voice: ${name}…` }),
        onVoice: (v) => get().addVoice(v),
        onCharacterImage: (img) => get().addCharacterImage(img),
        onSceneStart: (sceneId) => {
          set({ currentStep: 'Generating audio…' })
          patchClipByScene(sceneId, { status: 'running' })
        },
        onScenePhase: (sceneId, phase) => patchClipByScene(sceneId, { phase }),
        onScene: (sceneId, r) => patchClipByScene(sceneId, { status: 'done', url: r.url, durationSec: r.durationSec }),
        onKeyframe: (sceneId, url) => patchClipByScene(sceneId, { imageUrl: url }),
        onSceneVideoStart: (sceneId) => {
          set({ currentStep: 'Generating video…' })
          patchClipByScene(sceneId, { videoStatus: 'running' })
        },
        onSceneVideoPhase: (sceneId, phase) => patchClipByScene(sceneId, { videoPhase: phase }),
        onSceneVideo: (sceneId, url) => patchClipByScene(sceneId, { videoStatus: 'done', videoUrl: url }),
        onError: (scope, message) => {
          if (scope.startsWith('scene:')) {
            patchClipByScene(scope.slice('scene:'.length), { status: 'error', error: message })
          } else if (scope.startsWith('video:')) {
            patchClipByScene(scope.slice('video:'.length), { videoStatus: 'error' })
            get().toast({ kind: 'error', title: 'Video issue', message })
          } else {
            get().toast({ kind: 'error', title: 'Generation issue', message })
          }
        },
      },
    )
    set({ status: 'done', currentStep: null })
  },

  regenScene: async (sceneId) => {
    const { plan, library, characterLibrary, brief } = get()
    if (!plan) return
    const scene = plan.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    const urlByName = new Map<string, string>()
    for (const v of library) urlByName.set(v.name, v.url)
    const patch = (p: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...p } : c)) }))
    patch({
      status: 'running',
      error: undefined,
      url: undefined,
      videoUrl: undefined,
      videoStatus: undefined,
      videoPhase: undefined,
    })
    try {
      const r = await generateScene(scene, urlByName, {
        onScenePhase: (_id, phase) => patch({ phase }),
      })
      patch({ status: 'done', url: r.url, durationSec: r.durationSec })

      if (brief.withVideo) {
        patch({ videoStatus: 'running' })
        try {
          const imageByName = new Map<string, string>()
          for (const img of characterLibrary) imageByName.set(img.name.toLowerCase(), img.url)
          // Aligned to scene.speakers (undefined for imageless speakers like a narrator);
          // generateSceneVideo drops them and renumbers @ElementN. Same rule as the main pipeline.
          const mappedImages = scene.speakers.map((n) => imageByName.get(n.toLowerCase()))
          const presentImages = mappedImages.filter((u): u is string => !!u)
          const keyframe = await sceneKeyframe(scene, presentImages)
          patch({ imageUrl: keyframe })
          const v = await generateSceneVideo(scene, keyframe, mappedImages, r.durationSec || 10, (phase) =>
            patch({ videoPhase: phase }),
          )
          patch({ videoStatus: 'done', videoUrl: v.url })
        } catch (e) {
          const fe = mapFalError(e)
          patch({ videoStatus: 'error' })
          get().toast({ kind: 'error', title: 'Video issue', message: fe.message })
        }
      }
    } catch (e) {
      const fe = mapFalError(e)
      patch({ status: 'error', error: fe.message })
      get().toast({ kind: 'error', title: fe.title, message: fe.message })
    }
  },
}))
