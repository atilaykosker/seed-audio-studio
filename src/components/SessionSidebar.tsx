import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'

export function SessionSidebar() {
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
        onClick={newSession}
        className="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
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
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => loadSession(s.id)} title={s.title}>
                  {s.title}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    setEditingId(s.id)
                    setDraft(s.title)
                  }}
                  aria-label="Rename"
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100"
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
