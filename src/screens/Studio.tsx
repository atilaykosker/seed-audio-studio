import { useState } from 'react'
import { Clapperboard, Loader2, Menu, Copy } from 'lucide-react'
import { Badge, Button, Card, CardContent, Separator } from '@/components/ui'
import { BriefForm } from '@/components/BriefForm'
import { CharacterLibraryPanel } from '@/components/CharacterLibraryPanel'
import { ClipCard } from '@/components/ClipCard'
import { SessionSidebar } from '@/components/SessionSidebar'
import { useStore } from '@/store/useStore'
import { estimateBioCost, estimatePlanCost, formatUSD } from '@/lib/cost'
import { cn } from '@/lib/utils'
import type { Clip } from '@/lib/types'

export function Studio() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const status = useStore((s) => s.status)
  const currentStep = useStore((s) => s.currentStep)
  const category = useStore((s) => s.category)
  const clips = useStore((s) => s.clips)
  const plan = useStore((s) => s.plan)
  const bioPlan = useStore((s) => s.bioPlan)
  const brief = useStore((s) => s.brief)
  const videoModel = useStore((s) => s.videoModel)

  const clipByScene = new Map<string, Clip>(clips.map((c) => [c.sceneId, c]))
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {})

  const estCost = bioPlan
    ? estimateBioCost(bioPlan, videoModel, brief.shotSec)
    : plan
      ? estimatePlanCost(plan, videoModel)
      : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-[1400px] px-5 py-3 flex items-center gap-2.5">
          <button className="lg:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sessions">
            <Menu className="size-5" />
          </button>
          <Clapperboard className="size-5 text-primary" />
          <span className="font-semibold leading-tight">Seed Studio</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <div className={cn('w-60 shrink-0 border-r border-border/60', sidebarOpen ? 'block' : 'hidden lg:block')}>
          <SessionSidebar />
        </div>

        <main className="min-w-0 flex-1 px-5 py-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Left: inputs + library */}
          <div className="space-y-5">
            <Card>
              <CardContent className="pt-5">
                <BriefForm />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-5">
                <CharacterLibraryPanel />
              </CardContent>
            </Card>
          </div>

          {/* Right: status + results */}
          <div className="space-y-4">
            {status !== 'idle' && (
              <div className="flex items-center gap-2 text-sm">
                {(status === 'planning' || status === 'generating') && (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                {category && <Badge>{category}</Badge>}
                <span className="text-muted-foreground">
                  {currentStep ?? (status === 'done' ? 'Done.' : status === 'error' ? 'Failed.' : '')}
                </span>
                {estCost != null && (
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    Est. cost: {formatUSD(estCost)}
                  </span>
                )}
              </div>
            )}

            {status === 'idle' && clips.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-10 text-center text-muted-foreground">
                <Clapperboard className="size-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Describe a video on the left and hit Generate.</p>
                <p className="text-xs mt-1">
                  Story mode renders multi-character shots with native audio; Biography mode renders silent shots of a
                  person's life — add your narration afterward.
                </p>
              </div>
            ) : bioPlan ? (
              <>
                <div className="flex items-center justify-between">
                  <Separator className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 shrink-0"
                    onClick={() => copy(bioPlan.pages.map((p) => p.narration).join('\n\n'))}
                  >
                    <Copy className="size-4" /> Copy full script
                  </Button>
                </div>
                {bioPlan.pages.map((page) => (
                  <div key={page.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">Page {page.index}</span>
                      <p className="text-sm text-foreground/90 flex-1 whitespace-pre-wrap">{page.narration}</p>
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => copy(page.narration)}>
                        <Copy className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {page.shots.map((shot) => {
                        const c = clipByScene.get(shot.id)
                        return c ? <ClipCard key={shot.id} clip={c} /> : null
                      })}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {clips.length > 0 && <Separator />}
                <div className="grid gap-3 sm:grid-cols-2">
                  {clips.map((c) => (
                    <ClipCard key={c.id} clip={c} />
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
