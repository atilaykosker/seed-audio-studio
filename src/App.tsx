import { useEffect } from 'react'
import { Toaster } from '@/components/Toaster'
import { KeyBubble } from '@/components/KeyBubble'
import { Studio } from '@/screens/Studio'
import { useStore } from '@/store/useStore'
import { configureFal } from '@/services/fal/client'
import { getStoredKey } from '@/services/fal/keyStore'

export default function App() {
  const setKey = useStore((s) => s.setKey)

  // Hydrate the stored key on first load — but the app is usable (presets) without one.
  useEffect(() => {
    const stored = getStoredKey()
    if (stored) {
      configureFal(stored)
      setKey(stored)
    }
    if (import.meta.env.DEV) {
      ;(window as unknown as { __store: typeof useStore }).__store = useStore
    }
  }, [setKey])

  return (
    <>
      <Studio />
      <KeyBubble />
      <Toaster />
    </>
  )
}
