import { useEffect, useState } from 'react'
import { Download, RefreshCw, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { Button, Card, CardContent, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Clip } from '@/lib/types'

export function ClipCard({ clip }: { clip: Clip }) {
  const regen = useStore((s) => s.regenScene)
  const editClipPrompt = useStore((s) => s.editClipPrompt)
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

  const regenerate = () => {
    if (draft !== clip.prompt) editClipPrompt(clip.sceneId, draft)
    regen(clip.sceneId)
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="font-medium truncate">{clip.title}</span>
            {clip.speakers.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{clip.speakers.join(' · ')}</div>
            )}
          </div>
        </div>

        {clip.status === 'done' && clip.videoUrl && (
          <video
            src={clip.videoUrl}
            controls
            playsInline
            preload="none"
            poster={clip.imageUrl}
            className="w-full rounded-md border border-border/60"
            onError={() => setMediaError(true)}
          />
        )}
        {mediaError && <p className="text-xs text-muted-foreground">media link expired — regenerate this clip</p>}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {clip.phase === 'queued' ? 'Queued…' : 'Generating…'}
          </div>
        )}
        {clip.status === 'pending' && <div className="text-sm text-muted-foreground">Waiting…</div>}
        {clip.status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{clip.error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowPrompt((v) => !v)}>
            <ChevronDown className={`size-4 transition-transform ${showPrompt ? 'rotate-180' : ''}`} /> Prompt
          </Button>
          {clip.videoUrl && (
            <a href={clip.videoUrl} download={`${clip.title.replace(/\s+/g, '_')}.mp4`}>
              <Button variant="ghost" size="sm">
                <Download className="size-4" /> Download
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={regenerate}>
            <RefreshCw className="size-4" /> Regenerate
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
            <p className="text-[11px] text-muted-foreground">Edit and hit Regenerate — the text is sent to the model as-is.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
