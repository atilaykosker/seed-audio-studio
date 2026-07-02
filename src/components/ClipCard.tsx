import { useEffect, useState } from 'react'
import { Download, RefreshCw, ChevronDown, Loader2, AlertCircle, Film } from 'lucide-react'
import { Button, Card, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'
import type { Clip } from '@/lib/types'

export function ClipCard({ clip }: { clip: Clip }) {
  const regen = useStore((s) => s.regenScene)
  const editClipPrompt = useStore((s) => s.editClipPrompt)
  const aspect = useStore((s) => s.brief.aspect)
  const [showPrompt, setShowPrompt] = useState(false)
  const [draft, setDraft] = useState(clip.prompt)
  const [mediaError, setMediaError] = useState(false)
  // Reset media error when new video loads (e.g., after regen).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMediaError(false), [clip.videoUrl])
  // Keep the editable draft in sync when the clip's prompt changes (regen, session load).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(clip.prompt), [clip.prompt])

  const busy = clip.status === 'running'
  const done = clip.status === 'done' && !!clip.videoUrl && !mediaError

  const status = busy
    ? clip.phase === 'queued'
      ? { dot: 'bg-amber-500', label: 'Queued' }
      : { dot: 'bg-primary', label: 'Rendering' }
    : clip.status === 'error' || mediaError
      ? { dot: 'bg-destructive', label: 'Failed' }
      : { dot: 'bg-muted-foreground', label: 'Waiting' }

  const regenerate = () => {
    if (draft !== clip.prompt) editClipPrompt(clip.sceneId, draft)
    regen(clip.sceneId)
  }

  return (
    <Card className="overflow-hidden">
      {/* Media hero */}
      <div
        className={cn(
          'group/media relative border-b bg-muted',
          aspect === 'portrait' ? 'aspect-[9/16] mx-auto w-full max-w-[calc(70vh*9/16)]' : 'aspect-video',
        )}
      >
        {done ? (
          <video
            src={clip.videoUrl}
            controls
            playsInline
            preload="none"
            poster={clip.imageUrl}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            onError={() => setMediaError(true)}
          />
        ) : (
          <>
            {clip.imageUrl && (
              <img src={clip.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            )}
            {busy && <div className="absolute inset-0 shimmer" />}
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              {busy ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  {clip.phase === 'queued' ? 'Queued…' : 'Generating…'}
                </div>
              ) : clip.status === 'error' ? (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>{clip.error}</span>
                </div>
              ) : mediaError ? (
                <p className="text-xs text-muted-foreground">media link expired — regenerate this clip</p>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Film className="size-6 opacity-40" />
                  <span className="text-xs">Waiting…</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Status chip (hidden once the video is ready and playable) */}
        {!done && (
          <span className="chip absolute left-2 top-2 text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', status.dot, busy && 'animate-pulse')} />
            {status.label}
          </span>
        )}
        {done && clip.durationSec != null && (
          <span className="chip absolute bottom-2 right-2 tabular-nums text-foreground/90">{clip.durationSec}s</span>
        )}
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-display font-semibold tracking-tight">{clip.title}</h3>
          {clip.speakers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {clip.speakers.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <span className="size-1.5 rounded-full bg-primary/70" />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => setShowPrompt((v) => !v)}>
            <ChevronDown className={cn('size-4 transition-transform', showPrompt && 'rotate-180')} /> Prompt
          </Button>
          {clip.videoUrl && (
            <a href={clip.videoUrl} download={`${clip.title.replace(/\s+/g, '_')}.mp4`}>
              <Button variant="ghost" size="sm" aria-label="Download clip">
                <Download className="size-4" />
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" disabled={busy} onClick={regenerate}>
            <RefreshCw className={cn('size-4', busy && 'animate-spin')} /> Regenerate
          </Button>
        </div>

        {showPrompt && (
          <div className="space-y-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="text-xs"
              placeholder="Edit the prompt, then Regenerate…"
            />
            <p className="text-[11px] text-muted-foreground">
              Edit and hit Regenerate — the text is sent to the model as-is.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
