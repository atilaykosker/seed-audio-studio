import { create } from 'zustand'
import { uid } from '@/lib/utils'
import * as api from '@/lib/api'
import type { SessionSummary } from '@/lib/api'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL } from '@/services/fal/client'
import type { Brief, Clip, CharacterImage, BiographyPlan, Plan, StudioStatus } from '@/lib/types'

const MODEL_KEY = 'bookticle-studio:model'
const VIDEO_MODEL_KEY = 'bookticle-studio:videoModel'

export interface Toast {
  id: string
  kind: 'info' | 'error' | 'success'
  title: string
  message?: string
}

/** Maps any thrown SDK error (ApiError or otherwise) to a user-facing toast payload. */
function errorToast(e: unknown): Omit<Toast, 'id'> {
  const err = e as { friendly?: { title?: string }; message?: string } | undefined
  return { kind: 'error', title: 'Something went wrong', message: err?.friendly?.title ?? err?.message }
}

/** Polls `fn` until `done(value)` is true, calling `onTick` with every observed value. Throws on timeout. */
async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (v: T) => boolean,
  onTick: (v: T) => void,
  { intervalMs = 4000, timeoutMs = 720000 } = {},
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    onTick(v)
    if (done(v)) return v
    if (Date.now() - start > timeoutMs) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

const DEFAULT_BRIEF: Brief = {
  idea: '',
  durationSec: 40,
  language: 'EN',
  speakers: 'auto',
  genre: '',
  aspect: 'landscape',
  type: 'story',
  shotSec: 8,
}

interface Store {
  toasts: Toast[]

  model: string
  videoModel: string
  brief: Brief
  characterLibrary: CharacterImage[]

  sessions: SessionSummary[]
  activeSessionId: string | null

  plan: Plan | null
  bioPlan: BiographyPlan | null
  category: string | null
  clips: Clip[]
  status: StudioStatus
  currentStep: string | null

  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  hydrate: () => Promise<void>

  setModel: (m: string) => void
  setVideoModel: (m: string) => void
  setBrief: (patch: Partial<Brief>) => void
  editClipPrompt: (sceneId: string, text: string) => void

  addCharacterImage: (img: CharacterImage) => void
  removeCharacterImage: (id: string) => Promise<void>
  clearCharacterLibrary: () => Promise<void>

  newSession: () => void
  loadSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>

  clearResults: () => void
  runStudio: () => Promise<void>
  regenScene: (sceneId: string) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  toasts: [],

  model: DEFAULT_MODEL,
  videoModel: DEFAULT_VIDEO_MODEL,
  brief: DEFAULT_BRIEF,
  characterLibrary: [],

  sessions: [],
  activeSessionId: null,

  plan: null,
  bioPlan: null,
  category: null,
  clips: [],
  status: 'idle',
  currentStep: null,

  toast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid() }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  hydrate: async () => {
    try {
      const [sessions, characterLibrary] = await Promise.all([api.listSessions(), api.listCharacters()])
      const model = (typeof window !== 'undefined' && localStorage.getItem(MODEL_KEY)) || DEFAULT_MODEL
      const videoModel = (typeof window !== 'undefined' && localStorage.getItem(VIDEO_MODEL_KEY)) || DEFAULT_VIDEO_MODEL
      set({ sessions, characterLibrary, model, videoModel })
    } catch (e) {
      get().toast(errorToast(e))
    }
  },

  setModel: (m) => {
    if (typeof window !== 'undefined') localStorage.setItem(MODEL_KEY, m)
    set({ model: m })
  },
  setVideoModel: (m) => {
    if (typeof window !== 'undefined') localStorage.setItem(VIDEO_MODEL_KEY, m)
    set({ videoModel: m })
  },
  setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),

  editClipPrompt: (sceneId, text) => {
    // TODO(plan-task-5): persist via api.editClipPrompt
    set((s) => {
      const clips = s.clips.map((c) => (c.sceneId === sceneId ? { ...c, prompt: text } : c))
      if (s.bioPlan) {
        const bioPlan = {
          ...s.bioPlan,
          pages: s.bioPlan.pages.map((pg) => ({
            ...pg,
            shots: pg.shots.map((sh) => (sh.id === sceneId ? { ...sh, visual: text } : sh)),
          })),
        }
        return { clips, bioPlan }
      }
      if (s.plan) {
        const plan = {
          ...s.plan,
          scenes: s.plan.scenes.map((sc) => (sc.id === sceneId ? { ...sc, visual: text, dialogue: '' } : sc)),
        }
        return { clips, plan }
      }
      return { clips }
    })
  },

  addCharacterImage: (img) =>
    set((s) => ({ characterLibrary: [img, ...s.characterLibrary.filter((x) => x.id !== img.id)] })),

  removeCharacterImage: async (id) => {
    try {
      await api.deleteCharacter(id)
      set((s) => ({ characterLibrary: s.characterLibrary.filter((x) => x.id !== id) }))
    } catch (e) {
      get().toast(errorToast(e))
    }
  },

  clearCharacterLibrary: async () => {
    const ids = get().characterLibrary.map((c) => c.id)
    for (const id of ids) {
      try {
        await api.deleteCharacter(id)
      } catch (e) {
        get().toast(errorToast(e))
      }
    }
    set({ characterLibrary: [] })
  },

  newSession: () =>
    set({
      activeSessionId: null,
      brief: DEFAULT_BRIEF,
      plan: null,
      bioPlan: null,
      category: null,
      clips: [],
      status: 'idle',
      currentStep: null,
    }),

  loadSession: async (id) => {
    try {
      const s = await api.getSession(id)
      if (!s) return
      set({
        activeSessionId: id,
        brief: { ...DEFAULT_BRIEF, ...s.brief },
        plan: s.plan,
        bioPlan: s.bioPlan,
        category: s.category,
        clips: s.clips,
        videoModel: s.videoModel ?? get().videoModel,
        status: s.clips.length ? 'done' : 'idle',
        currentStep: null,
      })
    } catch (e) {
      get().toast(errorToast(e))
    }
  },

  renameSession: async (id, title) => {
    const t = title.trim() || 'Untitled'
    try {
      await api.renameSession(id, t)
      set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: t } : x)) }))
    } catch (e) {
      get().toast(errorToast(e))
    }
  },

  deleteSession: async (id) => {
    try {
      await api.deleteSession(id)
    } catch (e) {
      get().toast(errorToast(e))
      return
    }
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }))
    if (get().activeSessionId === id) {
      get().clearResults()
      set({ activeSessionId: null })
    }
  },

  clearResults: () => set({ plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null }),

  runStudio: async () => {
    const { brief, model, videoModel } = get()
    if (!brief.idea.trim()) {
      get().toast({ kind: 'error', title: 'Add a brief', message: 'Describe the video you want to generate.' })
      return
    }

    set({
      status: 'planning',
      currentStep: brief.type === 'biography' ? 'Planning biography…' : 'Planning shots…',
      plan: null,
      bioPlan: null,
      clips: [],
    })

    let res: Awaited<ReturnType<typeof api.createPlan>>
    try {
      res = await api.createPlan(brief, { model, videoModel })
    } catch (e) {
      set({ status: 'error', currentStep: null })
      get().toast(errorToast(e))
      return
    }

    set({
      activeSessionId: res.sessionId,
      plan: res.plan ?? null,
      bioPlan: res.bioPlan ?? null,
      category: res.category,
      clips: res.clips,
      status: 'generating',
    })
    void get().hydrate()

    const patchClipByScene = (sceneId: string, patch: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...patch } : c)) }))

    // Mint characters before scenes — the server's scene-gen needs the library populated.
    if (brief.type === 'biography' && res.bioPlan) {
      const bio = res.bioPlan
      for (const stage of bio.stages) {
        const name = `${bio.subject} — ${stage.label}`
        if (get().characterLibrary.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue
        set({ currentStep: `Creating ${name}…` })
        try {
          const { characterId } = await api.generateStage(bio.subject, stage, bio.style)
          const s = await pollUntil(
            () => api.characterStatus(characterId),
            (v) => v.status === 'done' || v.status === 'error',
            () => {},
          )
          if (s.status === 'done' && s.url) {
            get().addCharacterImage({ id: characterId, name, url: s.url, source: 'minted', createdAt: Date.now() })
          } else {
            get().toast({ kind: 'error', title: s.error?.title ?? 'Character generation failed' })
          }
        } catch (e) {
          get().toast(errorToast(e))
        }
      }
    } else if (res.plan) {
      for (const ch of res.plan.characters) {
        if (get().characterLibrary.some((c) => c.name.toLowerCase() === ch.name.toLowerCase())) continue
        set({ currentStep: `Creating ${ch.name}…` })
        try {
          const { characterId } = await api.generateCharacter(ch)
          const s = await pollUntil(
            () => api.characterStatus(characterId),
            (v) => v.status === 'done' || v.status === 'error',
            () => {},
          )
          if (s.status === 'done' && s.url) {
            get().addCharacterImage({ id: characterId, name: ch.name, url: s.url, source: 'minted', createdAt: Date.now() })
          } else {
            get().toast({ kind: 'error', title: s.error?.title ?? 'Character generation failed' })
          }
        } catch (e) {
          get().toast(errorToast(e))
        }
      }
    }

    // Generate scenes in clip order.
    for (const clip of res.clips) {
      patchClipByScene(clip.sceneId, { status: 'running' })
      set({ currentStep: `Generating ${clip.title}…` })
      try {
        await api.generateScene(res.sessionId, clip.sceneId)
        const s = await pollUntil(
          () => api.clipStatus(clip.id),
          (v) => v.status === 'done' || v.status === 'error',
          (v) => {
            if (v.phase) patchClipByScene(clip.sceneId, { phase: v.phase as Clip['phase'] })
          },
        )
        if (s.status === 'done') {
          patchClipByScene(clip.sceneId, { status: 'done', videoUrl: s.videoUrl, phase: 'done' })
        } else {
          patchClipByScene(clip.sceneId, { status: 'error', error: s.error?.title ?? 'Generation failed' })
        }
      } catch (e) {
        patchClipByScene(clip.sceneId, { status: 'error', error: errorToast(e).message ?? 'Generation failed' })
      }
    }

    set({ status: 'done', currentStep: null })
  },

  regenScene: async (sceneId) => {
    const { activeSessionId, clips } = get()
    const clip = clips.find((c) => c.sceneId === sceneId)
    if (!activeSessionId || !clip) return

    const patch = (p: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...p } : c)) }))

    patch({ status: 'running', error: undefined, videoUrl: undefined, imageUrl: undefined, phase: undefined })
    try {
      await api.generateScene(activeSessionId, sceneId)
      const s = await pollUntil(
        () => api.clipStatus(clip.id),
        (v) => v.status === 'done' || v.status === 'error',
        (v) => {
          if (v.phase) patch({ phase: v.phase as Clip['phase'] })
        },
      )
      if (s.status === 'done') {
        patch({ status: 'done', videoUrl: s.videoUrl, phase: 'done' })
      } else {
        patch({ status: 'error', error: s.error?.title ?? 'Generation failed' })
      }
    } catch (e) {
      patch({ status: 'error', error: 'Generation failed' })
      get().toast(errorToast(e))
    }
  },
}))
