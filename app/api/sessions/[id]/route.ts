// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { readEnv } from '../../env'
import { makeS3 } from '@/src/server/storage/s3'
import { assembleSession } from '@/src/server/api/assemble'
import { renameSession, deleteSession } from '@/src/server/db/sessions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await assembleSession(getDb(), makeS3(readEnv()), id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ session })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { title } = (await req.json().catch(() => ({}))) as { title?: string }
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  await renameSession(getDb(), id, title)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteSession(getDb(), id)
  return NextResponse.json({ ok: true })
}
