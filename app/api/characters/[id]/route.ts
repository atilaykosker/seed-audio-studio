// app/api/characters/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/src/server/db/client'
import { deleteCharacter } from '@/src/server/db/characters'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteCharacter(getDb(), id)
  return NextResponse.json({ ok: true })
}
