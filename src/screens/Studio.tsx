import { useState } from 'react'
import { Clapperboard, Loader2, Menu, Copy, Film } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Separator } from '@/components/ui'
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
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-30">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-5 py-3 flex items-center gap-2.5">
          <button
            className="lg:hidden -m-2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sessions"
            aria-expanded={sidebarOpen}
          >
            <Menu className="size-5" />
          </button>
          <span className="grid size-8 place-items-center rounded-lg btn-gradient">
            <Clapperboard className="size-4" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-bold tracking-tight">
              Bookticle <span className="text-gradient">Studio</span>
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              AI Video
            </span>
          </div>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-full border bg-[var(--overlay)] px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" />
            Bring your own key
          </span>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden transition-opacity duration-200',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!sidebarOpen}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[82%] bg-sidebar border-r border-border shadow-xl transition-transform duration-200 ease-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <SessionSidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
      </div>

      <div className="mx-auto flex max-w-[1400px]">
        <div className="hidden lg:block w-60 shrink-0 border-r border-border/60">
          <SessionSidebar />
        </div>

        <main className="min-w-0 flex-1 px-4 sm:px-6 py-6 lg:py-8 grid gap-6 lg:gap-8 lg:grid-cols-[400px_1fr]">
          {/* Left: inputs + library */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl btn-gradient">
                  <Film className="size-5" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="text-base">New video</CardTitle>
                  <CardDescription>Turn a one-line brief into rendered shots.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <BriefForm />
              </CardContent>
            </Card>
            <CharacterLibraryPanel />
          </div>

          {/* Right: status + results */}
          <div className="space-y-4">
            {status !== 'idle' && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--overlay)] px-3.5 py-2.5 text-sm">
                {(status === 'planning' || status === 'generating') && (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                {category && <Badge>{category}</Badge>}
                <span className="text-muted-foreground">
                  {currentStep ?? (status === 'done' ? 'Done.' : status === 'error' ? 'Failed.' : '')}
                </span>
                {estCost != null && (
                  <span className="ml-auto flex items-center gap-1 text-xs whitespace-nowrap">
                    <span className="text-muted-foreground">Est.</span>
                    <span className="font-display font-semibold tabular-nums text-foreground">{formatUSD(estCost)}</span>
                  </span>
                )}
              </div>
            )}

            {status === 'idle' && clips.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border card-fancy p-8 sm:p-12 text-center">
                <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl btn-gradient">
                  <Clapperboard className="size-7" />
                </div>
                <h2 className="font-display text-xl font-semibold tracking-tight">Your studio is ready</h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  Describe a video on the left and hit Generate — your shots will render here.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 text-left max-w-lg mx-auto">
                  <div className="rounded-xl border bg-[var(--overlay)] p-4">
                    <p className="font-display text-sm font-semibold">Story</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Multi-character shots with native audio.
                    </p>
                  </div>
                  <div className="rounded-xl border bg-[var(--overlay)] p-4">
                    <p className="font-display text-sm font-semibold">Biography</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Silent shots of a life — add your narration after.
                    </p>
                  </div>
                </div>
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
                    <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="grid gap-4 sm:grid-cols-2">
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
