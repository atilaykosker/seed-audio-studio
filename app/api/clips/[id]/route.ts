// app/api/clips/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { getClip, updateClipStatus } from '@/src/server/db/clips'
import { getSessionRow, updateSessionPlan } from '@/src/server/db/sessions'
import { findBioShot } from '@/src/server/pipeline/inputs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { text } = (await req.json().catch(() => ({}))) as { text?: string }
  if (typeof text !== 'string') return NextResponse.json({ error: 'text required' }, { status: 400 })

  const db = getDb()
  const clip = await getClip(db, id)
  if (!clip) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await updateClipStatus(db, id, { prompt: text })

  const s = await getSessionRow(db, clip.session_id)
  if (s) {
    let plan = s.plan
    let bioPlan = s.bio_plan
    if (plan) {
      const scene = plan.scenes.find((sc) => sc.id === clip.scene_id)
      if (scene) {
        plan = { ...plan, scenes: plan.scenes.map((sc) => (sc.id === clip.scene_id ? { ...sc, visual: text, dialogue: '' } : sc)) }
      }
    }
    if (bioPlan) {
      const found = findBioShot(bioPlan, clip.scene_id)
      if (found) {
        bioPlan = {
          ...bioPlan,
          pages: bioPlan.pages.map((pg) => ({
            ...pg,
            shots: pg.shots.map((sh) => (sh.id === clip.scene_id ? { ...sh, visual: text } : sh)),
          })),
        }
      }
    }
    if (plan !== s.plan || bioPlan !== s.bio_plan) await updateSessionPlan(db, clip.session_id, plan, bioPlan)
  }

  return NextResponse.json({ ok: true })
}
