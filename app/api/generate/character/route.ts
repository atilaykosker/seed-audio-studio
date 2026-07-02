import { NextRequest, NextResponse } from 'next/server'
import type { Character, CharacterImage } from '@/src/lib/types'
import { readEnv } from '../../env'
import { configureFal, submit } from '@/src/server/fal/queue'
import { mapFalError } from '@/src/services/fal/errors'
import { getSupabase } from '@/src/server/db/client'
import { insertPendingCharacter } from '@/src/server/db/characters'
import { characterMintJob } from '@/src/server/pipeline/inputs'

export async function POST(req: NextRequest) {
  const { character } = (await req.json().catch(() => ({}))) as { character?: Character }
  if (!character?.name) return NextResponse.json({ error: 'character required' }, { status: 400 })
  const env = readEnv()
  configureFal(env.FAL_KEY)
  const db = getSupabase(env)
  try {
    const job = characterMintJob(character)
    const requestId = await submit(job.endpointId, job.input)
    const draft: CharacterImage = { id: '', name: character.name, url: '', source: 'minted', createdAt: 0 }
    const row = await insertPendingCharacter(db, draft, requestId)
    return NextResponse.json({ characterId: row.id, requestId })
  } catch (e) {
    return NextResponse.json({ error: mapFalError(e) }, { status: 502 })
  }
}
