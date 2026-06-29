import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

const ICONS = {
  info: Info,
  error: TriangleAlert,
  success: CheckCircle2,
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex gap-3 rounded-lg border bg-card p-3 shadow-lg',
              t.kind === 'error' && 'border-destructive/40',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                t.kind === 'error' && 'text-destructive',
                t.kind === 'success' && 'text-emerald-600',
                t.kind === 'info' && 'text-muted-foreground',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.message && <p className="text-xs text-muted-foreground">{t.message}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
