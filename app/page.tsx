'use client'

import { useEffect } from 'react'
import { Studio } from '@/screens/Studio'
import { Toaster } from '@/components/Toaster'
import { useStore } from '@/store/useStore'

export default function Home() {
  const hydrate = useStore((s) => s.hydrate)
  useEffect(() => {
    void hydrate()
  }, [hydrate])
  return (
    <>
      <Studio />
      <Toaster />
    </>
  )
}
