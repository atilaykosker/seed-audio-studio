import { create } from 'zustand'
import { uid, sessionTitle } from '@/lib/utils'
import { mapFalError } from '@/services/fal/errors'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL, type VideoModelId } from '@/services/fal/client'
import { makePlan, makeBioPlan } from '@/services/studio/plan'
import { generateFromPlan, generateSceneClip, generateBiography, generateBioShot } from '@/services/studio/generate'
import type { Brief, Clip, CharacterImage, BiographyPlan, Plan, Session, StudioStatus } from '@/lib/types'

const MODEL_KEY = 'bookticle-studio:model'
const VIDEO_MODEL_KEY = 'bookticle-studio:videoModel'
const CHAR_KEY = 'bookticle-studio:characters'
const SESS_KEY = 'bookticle-studio:sessions'
const ACTIVE_KEY = 'bookticle-studio:activeSession'

export interface Toast {
  id: string
  kind: 'info' | 'error' | 'success'
  title: string
  message?: string
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

function loadSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(SESS_KEY) ?? '[]') as Session[]
  } catch {
    return []
  }
}
function saveSessions(v: Session[]) {
  localStorage.setItem(SESS_KEY, JSON.stringify(v)) // may throw QuotaExceededError
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
  key: string | null
  keyDialogOpen: boolean
  toasts: Toast[]

  model: string
  videoModel: string
  brief: Brief
  characterLibrary: CharacterImage[]

  sessions: Session[]
  activeSessionId: string | null

  plan: Plan | null
  bioPlan: BiographyPlan | null
  category: string | null
  clips: Clip[]
  status: StudioStatus
  currentStep: string | null

  setKey: (k: string | null) => void
  setKeyDialogOpen: (v: boolean) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  setModel: (m: string) => void
  setVideoModel: (m: string) => void
  setBrief: (patch: Partial<Brief>) => void
  editClipPrompt: (sceneId: string, text: string) => void

  addCharacterImage: (img: CharacterImage) => void
  removeCharacterImage: (id: string) => void
  clearCharacterLibrary: () => void

  beginSession: () => void
  saveActiveSession: () => void
  newSession: () => void
  loadSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void

  clearResults: () => void
  runStudio: () => Promise<void>
  regenScene: (sceneId: string) => Promise<void>
}

const _sessions0 = loadSessions()
const _activeId0 = localStorage.getItem(ACTIVE_KEY)
const _active0 = _sessions0.find((x) => x.id === _activeId0) ?? null
if (_activeId0 && !_active0) localStorage.removeItem(ACTIVE_KEY)

export const useStore = create<Store>((set, get) => ({
  key: null,
  keyDialogOpen: false,
  toasts: [],

  model: localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL,
  videoModel: _active0?.videoModel ?? localStorage.getItem(VIDEO_MODEL_KEY) ?? DEFAULT_VIDEO_MODEL,
  brief: _active0 ? { ...DEFAULT_BRIEF, ..._active0.brief } : DEFAULT_BRIEF,
  characterLibrary: loadCharacterLibrary(),

  sessions: _sessions0,
  activeSessionId: _active0 ? _activeId0 : null,

  plan: _active0?.plan ?? null,
  bioPlan: _active0?.bioPlan ?? null,
  category: _active0?.category ?? null,
  clips: _active0?.clips ?? [],
  status: _active0 && _active0.clips.length ? 'done' : 'idle',
  currentStep: null,

  setKey: (k) => set({ key: k }),
  setKeyDialogOpen: (v) => set({ keyDialogOpen: v }),
  toast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid() }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setModel: (m) => {
    localStorage.setItem(MODEL_KEY, m)
    set({ model: m })
  },
  setVideoModel: (m) => {
    localStorage.setItem(VIDEO_MODEL_KEY, m)
    set({ videoModel: m })
  },
  setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),

  editClipPrompt: (sceneId, text) => {
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
    get().saveActiveSession()
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

  beginSession: () => {
    const s = get()
    if (s.activeSessionId) return
    const now = Date.now()
    const sess: Session = {
      id: uid(),
      title: sessionTitle(s.brief.idea),
      createdAt: now,
      updatedAt: now,
      brief: s.brief,
      plan: null,
      bioPlan: null,
      category: null,
      clips: [],
      videoModel: s.videoModel,
    }
    const next = [sess, ...s.sessions]
    try {
      saveSessions(next)
    } catch {
      get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      return
    }
    localStorage.setItem(ACTIVE_KEY, sess.id)
    set({ sessions: next, activeSessionId: sess.id })
  },

  saveActiveSession: () => {
    const s = get()
    if (!s.activeSessionId) return
    const next = s.sessions.map((x) =>
      x.id === s.activeSessionId
        ? { ...x, brief: s.brief, plan: s.plan, bioPlan: s.bioPlan, category: s.category, clips: s.clips, videoModel: s.videoModel, updatedAt: Date.now() }
        : x,
    )
    try {
      saveSessions(next)
    } catch {
      get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      return
    }
    set({ sessions: next })
  },

  newSession: () => {
    localStorage.removeItem(ACTIVE_KEY)
    set({ activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null })
  },

  loadSession: (id) => {
    const sess = get().sessions.find((x) => x.id === id)
    if (!sess) return
    localStorage.setItem(ACTIVE_KEY, id)
    set({
      activeSessionId: id,
      brief: { ...DEFAULT_BRIEF, ...sess.brief },
      plan: sess.plan,
      bioPlan: sess.bioPlan ?? null,
      category: sess.category,
      clips: sess.clips,
      videoModel: sess.videoModel ?? get().videoModel,
      status: sess.clips.length ? 'done' : 'idle',
      currentStep: null,
    })
  },

  renameSession: (id, title) =>
    set((s) => {
      const t = title.trim() || 'Untitled'
      const next = s.sessions.map((x) => (x.id === id ? { ...x, title: t, updatedAt: Date.now() } : x))
      try {
        saveSessions(next)
      } catch {
        get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      }
      return { sessions: next }
    }),

  deleteSession: (id) =>
    set((s) => {
      const next = s.sessions.filter((x) => x.id !== id)
      try {
        saveSessions(next)
      } catch {
        get().toast({ kind: 'error', title: 'Storage full', message: 'Delete old sessions to save new ones.' })
      }
      if (s.activeSessionId === id) {
        localStorage.removeItem(ACTIVE_KEY)
        return { sessions: next, activeSessionId: null, brief: DEFAULT_BRIEF, plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null }
      }
      return { sessions: next }
    }),

  clearResults: () => set({ plan: null, bioPlan: null, category: null, clips: [], status: 'idle', currentStep: null }),

  runStudio: async () => {
    const { key, brief, model, videoModel } = get()
    if (!key) {
      set({ keyDialogOpen: true })
      return
    }
    if (!brief.idea.trim()) {
      get().toast({ kind: 'error', title: 'Add a brief', message: 'Describe the video you want to generate.' })
      return
    }
    get().beginSession()

    const patchClipByScene = (sceneId: string, patch: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...patch } : c)) }))

    if (brief.type === 'biography') {
      set({ status: 'planning', currentStep: 'Planning biography…', plan: null, bioPlan: null, clips: [] })
      let bio: BiographyPlan
      try {
        bio = await makeBioPlan(brief, model)
      } catch (e) {
        const fe = mapFalError(e)
        set({ status: 'error', currentStep: null })
        get().toast({ kind: 'error', title: fe.title, message: fe.message })
        return
      }
      const clips: Clip[] = bio.pages.flatMap((page) =>
        page.shots.map((shot, i) => ({
          id: uid(),
          sceneId: shot.id,
          title: `Page ${page.index} · Shot ${i + 1}`,
          speakers: [],
          prompt: shot.visual,
          status: 'pending' as const,
        })),
      )
      set({ bioPlan: bio, category: 'Biography', clips, status: 'generating' })
      get().saveActiveSession()

      await generateBiography(
        bio,
        { characterLibrary: get().characterLibrary, videoModel: videoModel as VideoModelId, aspect: brief.aspect, shotSec: brief.shotSec },
        {
          onCharacterImage: (img) => get().addCharacterImage(img),
          onSceneStart: (sceneId) => {
            set({ currentStep: 'Generating shot…' })
            patchClipByScene(sceneId, { status: 'running' })
          },
          onKeyframe: (sceneId, url) => patchClipByScene(sceneId, { imageUrl: url }),
          onScenePhase: (sceneId, phase) => patchClipByScene(sceneId, { phase }),
          onScene: (sceneId, r) => {
            patchClipByScene(sceneId, { status: 'done', videoUrl: r.url })
            get().saveActiveSession()
          },
          onError: (scope, message) => {
            if (scope.startsWith('scene:')) {
              patchClipByScene(scope.slice('scene:'.length), { status: 'error', error: message })
            } else {
              get().toast({ kind: 'error', title: 'Generation issue', message })
            }
          },
        },
      )
      set({ status: 'done', currentStep: null })
      get().saveActiveSession()
      return
    }

    // story
    set({ status: 'planning', currentStep: 'Planning shots…', plan: null, bioPlan: null, clips: [] })
    let plan: Plan
    try {
      plan = await makePlan(brief, model)
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
      speakers: sc.speakers,
      prompt: [sc.visual, sc.dialogue].filter(Boolean).join('\n'),
      status: 'pending',
    }))
    set({ plan, category: plan.category, clips, status: 'generating' })
    get().saveActiveSession()

    await generateFromPlan(
      plan,
      { characterLibrary: get().characterLibrary, videoModel: videoModel as VideoModelId, aspect: brief.aspect },
      {
        onCharacterImage: (img) => get().addCharacterImage(img),
        onSceneStart: (sceneId) => {
          set({ currentStep: 'Generating video…' })
          patchClipByScene(sceneId, { status: 'running' })
        },
        onKeyframe: (sceneId, url) => patchClipByScene(sceneId, { imageUrl: url }),
        onScenePhase: (sceneId, phase) => patchClipByScene(sceneId, { phase }),
        onScene: (sceneId, r) => {
          patchClipByScene(sceneId, { status: 'done', videoUrl: r.url })
          get().saveActiveSession()
        },
        onError: (scope, message) => {
          if (scope.startsWith('scene:')) {
            patchClipByScene(scope.slice('scene:'.length), { status: 'error', error: message })
          } else {
            get().toast({ kind: 'error', title: 'Generation issue', message })
          }
        },
      },
    )
    set({ status: 'done', currentStep: null })
    get().saveActiveSession()
  },

  regenScene: async (sceneId) => {
    const { plan, bioPlan, characterLibrary, brief, videoModel } = get()
    const patch = (p: Partial<Clip>) =>
      set((s) => ({ clips: s.clips.map((c) => (c.sceneId === sceneId ? { ...c, ...p } : c)) }))

    if (brief.type === 'biography' && bioPlan) {
      const shot = bioPlan.pages.flatMap((pg) => pg.shots).find((sh) => sh.id === sceneId)
      if (!shot) return
      patch({ status: 'running', error: undefined, videoUrl: undefined, imageUrl: undefined, phase: undefined })
      try {
        const libByName = new Map<string, string>()
        for (const img of characterLibrary) libByName.set(img.name.toLowerCase(), img.url)
        const stageImageById = new Map<string, string>()
        for (const stage of bioPlan.stages) {
          const url = libByName.get(`${bioPlan.subject} — ${stage.label}`.toLowerCase())
          if (url) stageImageById.set(stage.id, url)
        }
        const r = await generateBioShot(
          { shot, stageImageById, style: bioPlan.style, videoModel: videoModel as VideoModelId, aspect: brief.aspect, shotSec: brief.shotSec },
          { onKeyframe: (_id, url) => patch({ imageUrl: url }), onScenePhase: (_id, phase) => patch({ phase }) },
        )
        patch({ status: 'done', videoUrl: r.url })
      } catch (e) {
        const fe = mapFalError(e)
        patch({ status: 'error', error: fe.message })
        get().toast({ kind: 'error', title: fe.title, message: fe.message })
      }
      get().saveActiveSession()
      return
    }

    if (!plan) return
    const scene = plan.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    patch({ status: 'running', error: undefined, videoUrl: undefined, imageUrl: undefined, phase: undefined })
    try {
      const imageByName = new Map<string, string>()
      for (const img of characterLibrary) imageByName.set(img.name.toLowerCase(), img.url)
      const voiceByName = new Map<string, string>()
      for (const c of plan.characters) voiceByName.set(c.name.toLowerCase(), c.voice)
      const r = await generateSceneClip(
        { scene, imageByName, voiceByName, videoModel: videoModel as VideoModelId, aspect: brief.aspect, durationSec: 8 },
        { onKeyframe: (_id, url) => patch({ imageUrl: url }), onScenePhase: (_id, phase) => patch({ phase }) },
      )
      patch({ status: 'done', videoUrl: r.url })
    } catch (e) {
      const fe = mapFalError(e)
      patch({ status: 'error', error: fe.message })
      get().toast({ kind: 'error', title: fe.title, message: fe.message })
    }
    get().saveActiveSession()
  },
}))
