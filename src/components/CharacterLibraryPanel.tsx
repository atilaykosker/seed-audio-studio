'use client'

import { Trash2, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import { useStore } from '@/store/useStore'

export function CharacterLibraryPanel() {
  const library = useStore((s) => s.characterLibrary)
  const removeCharacterImage = useStore((s) => s.removeCharacterImage)
  const clearCharacterLibrary = useStore((s) => s.clearCharacterLibrary)

  if (library.length === 0) return null

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted border">
              <Users className="size-4 text-muted-foreground" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold">Character library</p>
              <p className="text-xs text-muted-foreground">{library.length} saved · reused by name</p>
            </div>
          </div>
          <button
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={clearCharacterLibrary}
          >
            Clear
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
        {library.map((c) => (
          <figure key={c.id} className="relative">
            <img src={c.url} alt={c.name} className="aspect-square w-full rounded-md object-cover border border-border/60" />
            <figcaption className="mt-1 truncate text-center text-[11px] text-muted-foreground">{c.name}</figcaption>
            <button
              className="absolute right-1 top-1 cursor-pointer rounded bg-black/50 p-1 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={() => removeCharacterImage(c.id)}
              title="Remove"
              aria-label={`Remove ${c.name}`}
            >
              <Trash2 className="size-3" />
            </button>
            </figure>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
