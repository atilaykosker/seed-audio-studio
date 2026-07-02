import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '../../../env'
import { configureFal, jobStatus, jobResult, downloadToBytes, submit } from '@/src/server/fal/queue'
import { mapFalError } from '@/src/services/fal/errors'
import { getSupabase } from '@/src/server/db/client'
import { getClip, updateClipStatus } from '@/src/server/db/clips'
import { getSessionRow } from '@/src/server/db/sessions'
import { makeS3 } from '@/src/server/storage/s3'
import { nextClipAction } from '@/src/server/pipeline/advance'
import { sceneVideoJob, bioVideoJob, findBioShot, type FalJob } from '@/src/server/pipeline/inputs'
import type { VideoModelId } from '@/src/services/fal/client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  const s3 = makeS3(env)

  const clip = await getClip(db, id)
  if (!clip) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (clip.video_key) {
    return NextResponse.json({ status: 'done', videoUrl: await s3.presignGet(clip.video_key) })
  }
  if (!clip.request_id) {
    return NextResponse.json({ status: clip.status })
  }
  if (!clip.request_endpoint) {
    return NextResponse.json({ status: clip.status })
  }

  try {
    const st = await jobStatus(clip.request_endpoint!, clip.request_id)
    if (st.phase !== 'done') return NextResponse.json({ status: 'running', phase: st.phase })

    const action = nextClipAction(clip)

    if (action === 'poll-keyframe') {
      // Keyframe finished — download it, then chain into the video job.
      const data = await jobResult<{ images: { url: string }[] }>(clip.request_endpoint!, clip.request_id)
      if (!data.images?.length) throw new Error('fal returned no image')
      const { bytes, contentType } = await downloadToBytes(data.images[0].url)
      const imageKey = `sessions/${clip.session_id}/clips/${id}.png`
      await s3.putObject(imageKey, bytes, contentType)

      const session = await getSessionRow(db, clip.session_id)
      if (!session) throw new Error('session not found')
      const videoModel = session.video_model as VideoModelId
      const startImageUrl = await s3.presignGet(imageKey)

      let job: FalJob
      if (session.brief.type === 'biography') {
        const bioPlan = session.bio_plan
        if (!bioPlan) throw new Error('session has no bio_plan')
        const found = findBioShot(bioPlan, clip.scene_id)
        if (!found) throw new Error('shot not found')
        job = bioVideoJob(videoModel, bioPlan.style, found.shot.visual, startImageUrl, session.brief.shotSec, session.brief.aspect)
      } else {
        const plan = session.plan
        if (!plan) throw new Error('session has no plan')
        const scene = plan.scenes.find((s) => s.id === clip.scene_id)
        if (!scene) throw new Error('scene not found')
        const voiceByName = new Map(plan.characters.map((c) => [c.name.toLowerCase(), c.voice]))
        job = sceneVideoJob(videoModel, scene, startImageUrl, voiceByName, 8, session.brief.aspect)
      }

      const videoRequestId = await submit(job.endpointId, job.input)
      await updateClipStatus(db, id, {
        image_key: imageKey,
        request_id: videoRequestId,
        request_endpoint: job.endpointId,
        phase: 'queued',
      })
      return NextResponse.json({ status: 'running', phase: 'queued' })
    }

    // action === 'poll-video' — video finished, download + finalize.
    const data = await jobResult<{ video: { url: string } }>(clip.request_endpoint!, clip.request_id)
    if (!data.video?.url) throw new Error('fal returned no video')
    const { bytes, contentType } = await downloadToBytes(data.video.url)
    const videoKey = `sessions/${clip.session_id}/clips/${id}.mp4`
    await s3.putObject(videoKey, bytes, contentType)

    const session = await getSessionRow(db, clip.session_id)
    if (!session) throw new Error('session not found')
    const durationSec = session.brief.type === 'biography' ? session.brief.shotSec : 8

    await updateClipStatus(db, id, {
      video_key: videoKey,
      status: 'done',
      phase: 'done',
      duration_sec: durationSec,
    })
    return NextResponse.json({ status: 'done', videoUrl: await s3.presignGet(videoKey) })
  } catch (e) {
    const friendly = mapFalError(e)
    try {
      await updateClipStatus(db, id, { status: 'error', error: friendly.message, request_id: null, phase: null })
    } catch {
      // best-effort; don't mask the original error
    }
    return NextResponse.json({ status: 'error', error: friendly }, { status: 502 })
  }
}
