import { configureFal, uploadAsset } from './client'

const STORAGE_KEY = 'seed-audio-studio:key'

export function getStoredKey(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function storeKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
}

export function clearKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** fal keys look like `<uuid>:<hex secret>`. A light client-side sanity check. */
export function looksLikeKey(key: string): boolean {
  return /^[a-z0-9-]{16,}:[a-z0-9]{16,}$/i.test(key.trim())
}

/**
 * Validate a key with the cheapest authenticated call: a tiny upload to fal storage.
 * Throws (ApiError 401/403) if the key is rejected. Configures the client on success.
 */
export async function validateKey(key: string): Promise<void> {
  configureFal(key.trim())
  await uploadAsset(new Blob([new Uint8Array([0])], { type: 'application/octet-stream' }))
}
