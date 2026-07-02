import { NextRequest, NextResponse } from 'next/server'
import type { Character, CharacterImage, BioStage } from '@/src/lib/types'
import { readEnv } from '../../env'
import { configureFal, submit } from '@/src/server/fal/queue'
import { mapFalError } from '@/src/services/fal/errors'
import { getSupabase } from '@/src/server/db/client'
import { insertPendingCharacter } from '@/src/server/db/characters'
import { characterMintJob, stageMintJob, type FalJob } from '@/src/server/pipeline/inputs'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    character?: Character
    stage?: { subject: string; stage: BioStage; style: string }
  }
  const { character, stage } = body

  let job: FalJob
  let name: string
  if (character?.name) {
    job = characterMintJob(character)
    name = character.name
  } else if (stage?.subject && stage.stage && stage.style) {
    job = stageMintJob(stage.subject, stage.stage, stage.style)
    name = `${stage.subject} — ${stage.stage.label}`
  } else {
    return NextResponse.json({ error: 'character or stage required' }, { status: 400 })
  }

  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  try {
    const requestId = await submit(job.endpointId, job.input)
    const draft: CharacterImage = { id: '', name, url: '', source: 'minted', createdAt: 0 }
    const row = await insertPendingCharacter(db, draft, requestId)
    return NextResponse.json({ characterId: row.id, requestId })
  } catch (e) {
    return NextResponse.json({ error: mapFalError(e) }, { status: 502 })
  }
}
