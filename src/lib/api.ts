// src/lib/api.ts — client SDK. Types only from ./types; fetch-based; same-origin cookies.
import type { Brief, Plan, BiographyPlan, Clip, Session, CharacterImage, Character, BioStage } from './types'
import type { FriendlyError } from '../services/fal/errors'

export type SessionSummary = Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'category' | 'videoModel'>

export class ApiError extends Error {
  status: number
  friendly?: FriendlyError
  constructor(status: number, friendly?: FriendlyError, message?: string) {
    super(message ?? friendly?.message ?? `API error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.friendly = friendly
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (body as { error?: FriendlyError }).error, typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : undefined)
  return body as T
}

export async function login(password: string): Promise<void> { await call('/api/login', { method: 'POST', body: JSON.stringify({ password }) }) }
export async function logout(): Promise<void> { await call('/api/logout', { method: 'POST' }) }

export function createPlan(brief: Brief, opts: { model?: string; videoModel?: string } = {}): Promise<{ sessionId: string; plan?: Plan; bioPlan?: BiographyPlan; category: string | null; clips: Clip[] }> {
  return call('/api/plan', { method: 'POST', body: JSON.stringify({ brief, ...opts }) })
}
export function generateCharacter(character: Character): Promise<{ characterId: string; requestId: string }> {
  return call('/api/generate/character', { method: 'POST', body: JSON.stringify({ character }) })
}
export function generateStage(subject: string, stage: BioStage, style: string): Promise<{ characterId: string; requestId: string }> {
  return call('/api/generate/character', { method: 'POST', body: JSON.stringify({ stage: { subject, stage, style } }) })
}
export function characterStatus(id: string): Promise<{ status: string; url?: string; error?: FriendlyError }> {
  return call(`/api/status/character/${id}`)
}
export function generateScene(sessionId: string, sceneId: string): Promise<{ requestId: string }> {
  return call('/api/generate/scene', { method: 'POST', body: JSON.stringify({ sessionId, sceneId }) })
}
export function clipStatus(id: string): Promise<{ status: string; phase?: string; videoUrl?: string; error?: FriendlyError }> {
  return call(`/api/status/clip/${id}`)
}
export async function listSessions(): Promise<SessionSummary[]> { return (await call<{ sessions: SessionSummary[] }>('/api/sessions')).sessions }
export async function getSession(id: string): Promise<Session | null> {
  try { return (await call<{ session: Session }>(`/api/sessions/${id}`)).session } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e }
}
export async function renameSession(id: string, title: string): Promise<void> { await call(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }) }
export async function deleteSession(id: string): Promise<void> { await call(`/api/sessions/${id}`, { method: 'DELETE' }) }
export async function listCharacters(): Promise<CharacterImage[]> { return (await call<{ characters: CharacterImage[] }>('/api/characters')).characters }
export async function deleteCharacter(id: string): Promise<void> { await call(`/api/characters/${id}`, { method: 'DELETE' }) }
