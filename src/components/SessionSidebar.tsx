import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

export function SessionSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeSessionId)
  const newSession = useStore((s) => s.newSession)
  const loadSession = useStore((s) => s.loadSession)
  const renameSession = useStore((s) => s.renameSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <aside className="flex h-full flex-col gap-2 p-3">
      <button
        onClick={() => {
          newSession()
          onNavigate?.()
        }}
        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" /> New
      </button>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm',
              s.id === activeId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
          >
            {editingId === s.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  renameSession(s.id, draft)
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameSession(s.id, draft)
                    setEditingId(null)
                  }
                }}
                className="w-full bg-transparent outline-none"
              />
            ) : (
              <>
                <button
                  className="min-w-0 flex-1 cursor-pointer truncate py-0.5 text-left"
                  onClick={() => {
                    loadSession(s.id)
                    onNavigate?.()
                  }}
                  title={s.title}
                >
                  {s.title}
                </button>
                <button
                  className="grid size-7 shrink-0 cursor-pointer place-items-center rounded transition-opacity hover:bg-background/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:opacity-0 lg:group-hover:opacity-100"
                  onClick={() => {
                    setEditingId(s.id)
                    setDraft(s.title)
                  }}
                  aria-label="Rename"
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </button>
                <button
                  className="grid size-7 shrink-0 cursor-pointer place-items-center rounded transition-opacity hover:bg-background/60 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:opacity-0 lg:group-hover:opacity-100"
                  onClick={() => {
                    if (confirm(`Delete "${s.title}"?`)) deleteSession(s.id)
                  }}
                  aria-label="Delete"
                >
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
