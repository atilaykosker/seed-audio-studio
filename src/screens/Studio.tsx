import { useState } from 'react'
import { AudioLines, Loader2, Menu } from 'lucide-react'
import { Badge, Card, CardContent, Separator } from '@/components/ui'
import { BriefForm } from '@/components/BriefForm'
import { VoiceLibraryPanel } from '@/components/VoiceLibraryPanel'
import { CharacterLibraryPanel } from '@/components/CharacterLibraryPanel'
import { ClipCard } from '@/components/ClipCard'
import { SessionSidebar } from '@/components/SessionSidebar'
import { useStore } from '@/store/useStore'
import { estimatePlanCost, formatUSD } from '@/lib/cost'
import { cn } from '@/lib/utils'

export function Studio() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const status = useStore((s) => s.status)
  const currentStep = useStore((s) => s.currentStep)
  const category = useStore((s) => s.category)
  const clips = useStore((s) => s.clips)
  const plan = useStore((s) => s.plan)
  const brief = useStore((s) => s.brief)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-[1400px] px-5 py-3 flex items-center gap-2.5">
          <button className="lg:hidden" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sessions">
            <Menu className="size-5" />
          </button>
          <AudioLines className="size-5 text-primary" />
          <span className="font-semibold leading-tight">Seed Audio Studio</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <div
          className={cn(
            'w-60 shrink-0 border-r border-border/60',
            sidebarOpen ? 'block' : 'hidden lg:block',
          )}
        >
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
                <VoiceLibraryPanel />
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
                {plan && (
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    Est. cost: {formatUSD(estimatePlanCost(plan, brief.durationSec, brief.withVideo))}
                  </span>
                )}
              </div>
            )}

            {status === 'idle' && clips.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-10 text-center text-muted-foreground">
                <AudioLines className="size-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Describe a scene on the left and hit Generate.</p>
                <p className="text-xs mt-1">
                  The model categorizes it, writes the seed-audio prompt with effects, mints each character voice, and
                  renders the audio.
                </p>
              </div>
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
