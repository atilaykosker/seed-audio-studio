import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '../../../env'
import { configureFal, jobStatus, jobResult, downloadToBytes } from '@/src/server/fal/queue'
import { ENDPOINTS } from '@/src/services/fal/client'
import { mapFalError } from '@/src/services/fal/errors'
import { getSupabase } from '@/src/server/db/client'
import { getCharacter, finishCharacter } from '@/src/server/db/characters'
import { makeS3 } from '@/src/server/storage/s3'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  const s3 = makeS3(env)
  const row = await getCharacter(db, id)
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (row.status === 'done') return NextResponse.json({ status: 'done', url: await s3.presignGet(row.image_key) })
  if (!row.request_id) return NextResponse.json({ status: row.status })
  try {
    const st = await jobStatus(ENDPOINTS.nanoBanana, row.request_id)
    if (st.phase !== 'done') return NextResponse.json({ status: st.phase })
    const data = await jobResult<{ images: { url: string }[] }>(ENDPOINTS.nanoBanana, row.request_id)
    const url = data.images[0].url
    const { bytes, contentType } = await downloadToBytes(url)
    const key = `characters/${id}.png`
    await s3.putObject(key, bytes, contentType)
    await finishCharacter(db, id, key)
    return NextResponse.json({ status: 'done', url: await s3.presignGet(key) })
  } catch (e) {
    return NextResponse.json({ status: 'error', error: mapFalError(e) }, { status: 502 })
  }
}
