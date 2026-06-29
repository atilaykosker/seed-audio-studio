import { useState } from 'react'
import { Download, RefreshCw, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { Badge, Button, Card, CardContent } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { clipCost, formatUSD } from '@/lib/cost'
import type { Clip } from '@/lib/types'

export function ClipCard({ clip }: { clip: Clip }) {
  const regen = useStore((s) => s.regenScene)
  const [showPrompt, setShowPrompt] = useState(false)
  const busy = clip.status === 'running'

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={clip.kind === 'TA2A' ? 'default' : 'secondary'}>{clip.kind}</Badge>
              <span className="font-medium truncate">{clip.title}</span>
            </div>
            {clip.speakers.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{clip.speakers.join(' · ')}</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {clip.durationSec ? `${clip.durationSec.toFixed(0)}s · ${formatUSD(clipCost(clip.durationSec))}` : ''}
          </div>
        </div>

        {clip.status === 'done' && clip.url && (
          <audio controls preload="none" src={clip.url} className="w-full" />
        )}
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
          {clip.url && (
            <a href={clip.url} download={`${clip.title.replace(/\s+/g, '_')}.wav`}>
              <Button variant="ghost" size="sm">
                <Download className="size-4" /> Download
              </Button>
            </a>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => regen(clip.sceneId)}>
            <RefreshCw className="size-4" /> Regenerate
          </Button>
        </div>

        {showPrompt && (
          <pre className="text-xs whitespace-pre-wrap bg-muted/50 rounded-md p-3 border border-border/60 text-muted-foreground">
            {clip.prompt}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}
