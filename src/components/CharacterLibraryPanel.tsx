import { Trash2, Image as ImageIcon } from 'lucide-react'
import { Label } from '@/components/ui'
import { useStore } from '@/store/useStore'

export function CharacterLibraryPanel() {
  const library = useStore((s) => s.characterLibrary)
  const removeCharacterImage = useStore((s) => s.removeCharacterImage)
  const clearCharacterLibrary = useStore((s) => s.clearCharacterLibrary)

  if (library.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <ImageIcon className="size-3.5" /> Character library
        </Label>
        <button
          className="text-xs text-muted-foreground hover:underline"
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
              className="absolute right-1 top-1 rounded bg-black/50 p-0.5 text-white hover:bg-black/70 transition-colors"
              onClick={() => removeCharacterImage(c.id)}
              title="Remove"
              aria-label={`Remove ${c.name}`}
            >
              <Trash2 className="size-3" />
            </button>
          </figure>
        ))}
      </div>
    </div>
  )
}
