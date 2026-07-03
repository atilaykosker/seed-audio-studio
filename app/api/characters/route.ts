// app/api/characters/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { readEnv } from '../env'
import { makeS3 } from '@/src/server/storage/s3'
import { assembleCharacters } from '@/src/server/api/assemble'

export async function GET() {
  const characters = await assembleCharacters(getDb(), makeS3(readEnv()))
  return NextResponse.json({ characters })
}
