/** localStorage namespace for all persisted app state. */
export const STORAGE_NS = 'bookticle-studio'

const LEGACY_NS = 'seed-audio-studio'
const MIGRATED_FLAG = `${STORAGE_NS}:_migrated`

/**
 * One-time migration of persisted data from the legacy `seed-audio-studio:` namespace
 * to `bookticle-studio:` after the rebrand — so existing users keep their fal key,
 * sessions, character library and settings. Idempotent; safe to call on every boot.
 */
export function migrateStorageNamespace(): void {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return
    const oldKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${LEGACY_NS}:`)) oldKeys.push(k)
    }
    for (const oldKey of oldKeys) {
      const newKey = `${STORAGE_NS}:${oldKey.slice(LEGACY_NS.length + 1)}`
      if (localStorage.getItem(newKey) == null) {
        const v = localStorage.getItem(oldKey)
        if (v != null) localStorage.setItem(newKey, v)
      }
    }
    localStorage.setItem(MIGRATED_FLAG, '1')
  } catch {
    /* private mode / storage disabled — nothing to migrate */
  }
}
