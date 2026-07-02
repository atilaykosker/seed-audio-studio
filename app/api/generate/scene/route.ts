import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '../../env'
import { configureFal, submit } from '@/src/server/fal/queue'
import { mapFalError } from '@/src/services/fal/errors'
import { getSupabase } from '@/src/server/db/client'
import { getSessionRow } from '@/src/server/db/sessions'
import { getClipBySceneId, updateClipStatus } from '@/src/server/db/clips'
import { listCharacters } from '@/src/server/db/characters'
import { makeS3 } from '@/src/server/storage/s3'
import { sceneKeyframeJob, bioKeyframeJob, findBioShot, type FalJob } from '@/src/server/pipeline/inputs'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; sceneId?: string }
  const { sessionId, sceneId } = body
  if (!sessionId || !sceneId) return NextResponse.json({ error: 'sessionId and sceneId required' }, { status: 400 })

  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  const s3 = makeS3(env)

  const session = await getSessionRow(db, sessionId)
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  const clip = await getClipBySceneId(db, sessionId, sceneId)
  if (!clip) return NextResponse.json({ error: 'clip not found' }, { status: 404 })

  try {
    const characters = await listCharacters(db)
    let job: FalJob

    if (session.brief.type === 'biography') {
      const bioPlan = session.bio_plan
      if (!bioPlan) throw new Error('session has no bio_plan')
      const found = findBioShot(bioPlan, sceneId)
      if (!found) return NextResponse.json({ error: 'shot not found' }, { status: 404 })
      const { shot } = found
      const stage = shot.stageId ? bioPlan.stages.find((s) => s.id === shot.stageId) : undefined
      const stageUrls: string[] = []
      if (stage) {
        const name = `${bioPlan.subject} — ${stage.label}`.toLowerCase()
        const row = characters.find((c) => c.name.toLowerCase() === name)
        if (row) stageUrls.push(await s3.presignGet(row.image_key))
      }
      job = bioKeyframeJob(shot.visual, stageUrls, bioPlan.style, session.brief.aspect)
    } else {
      const plan = session.plan
      if (!plan) throw new Error('session has no plan')
      const scene = plan.scenes.find((s) => s.id === sceneId)
      if (!scene) return NextResponse.json({ error: 'scene not found' }, { status: 404 })
      const presentUrls: string[] = []
      for (const name of scene.speakers) {
        const row = characters.find((c) => c.name.toLowerCase() === name.toLowerCase())
        if (row) presentUrls.push(await s3.presignGet(row.image_key))
      }
      job = sceneKeyframeJob(scene, presentUrls, session.brief.aspect)
    }

    const requestId = await submit(job.endpointId, job.input)
    await updateClipStatus(db, clip.id, {
      request_id: requestId,
      request_endpoint: job.endpointId,
      status: 'running',
      phase: 'queued',
      image_key: null,
    })
    return NextResponse.json({ requestId })
  } catch (e) {
    return NextResponse.json({ error: mapFalError(e) }, { status: 502 })
  }
}
