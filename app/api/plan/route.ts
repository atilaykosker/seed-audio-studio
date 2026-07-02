import { NextRequest, NextResponse } from 'next/server'
import type { Brief, Session } from '../../../src/lib/types'
import { makePlan, makeBioPlan } from '../../../src/services/studio/plan'
import { DEFAULT_MODEL, DEFAULT_VIDEO_MODEL } from '../../../src/services/fal/client'
import { mapFalError } from '../../../src/services/fal/errors'
import { configureFal } from '../../../src/server/fal/queue'
import { readEnv } from '../env'
import { getSupabase } from '../../../src/server/db/client'
import { createSession } from '../../../src/server/db/sessions'
import { insertClips } from '../../../src/server/db/clips'
import { rowToClip } from '../../../src/server/db/mappers'
import { planToClips, bioPlanToClips } from '../../../src/server/pipeline/clips'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { brief?: Brief; model?: string; videoModel?: string }
  const brief = body.brief
  if (!brief?.idea) return NextResponse.json({ error: 'brief.idea required' }, { status: 400 })

  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  const videoModel = body.videoModel ?? DEFAULT_VIDEO_MODEL

  try {
    let session: Session
    if (brief.type === 'biography') {
      const bioPlan = await makeBioPlan(brief, body.model ?? DEFAULT_MODEL)
      const clips = bioPlanToClips(bioPlan)
      session = { id: '', title: brief.idea.slice(0, 60), createdAt: 0, updatedAt: 0, brief, plan: null, bioPlan, category: 'Biography', clips, videoModel }
      const sessionId = await createSession(db, session)
      const rows = await insertClips(db, sessionId, clips)
      return NextResponse.json({ sessionId, bioPlan, category: 'Biography', clips: rows.map((r) => rowToClip(r, {})) })
    }
    const plan = await makePlan(brief, body.model ?? DEFAULT_MODEL)
    const clips = planToClips(plan)
    session = { id: '', title: brief.idea.slice(0, 60), createdAt: 0, updatedAt: 0, brief, plan, bioPlan: null, category: plan.category, clips, videoModel }
    const sessionId = await createSession(db, session)
    const rows = await insertClips(db, sessionId, clips)
    return NextResponse.json({ sessionId, plan, category: plan.category, clips: rows.map((r) => rowToClip(r, {})) })
  } catch (e) {
    return NextResponse.json({ error: mapFalError(e) }, { status: 502 })
  }
}
