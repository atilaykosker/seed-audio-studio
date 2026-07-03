// app/api/sessions/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { listSessions } from '@/src/server/db/sessions'

export async function GET() {
  const sessions = await listSessions(getDb())
  return NextResponse.json({ sessions })
}
