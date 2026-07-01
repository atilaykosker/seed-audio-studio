import { AudioLines, Loader2 } from 'lucide-react'

const REPO_URL = 'https://github.com/egebese/seed-audio-studio'

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  )
}
import { Badge, Card, CardContent, Separator } from '@/components/ui'
import { BriefForm } from '@/components/BriefForm'
import { VoiceLibraryPanel } from '@/components/VoiceLibraryPanel'
import { CharacterLibraryPanel } from '@/components/CharacterLibraryPanel'
import { ClipCard } from '@/components/ClipCard'
import { Hero, HowItWorks, Features, UseCases, FAQ, SiteFooter } from '@/components/Marketing'
import { Examples } from '@/components/Examples'
import { useStore } from '@/store/useStore'
import { estimatePlanCost, formatUSD } from '@/lib/cost'

export function Studio() {
  const status = useStore((s) => s.status)
  const currentStep = useStore((s) => s.currentStep)
  const category = useStore((s) => s.category)
  const clips = useStore((s) => s.clips)
  const plan = useStore((s) => s.plan)
  const brief = useStore((s) => s.brief)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-6xl px-5 py-3 flex items-center gap-2.5">
          <AudioLines className="size-5 text-primary" />
          <span className="font-semibold leading-tight">Seed Audio Studio</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">Ebook → multi-voice audiobook</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="View source on GitHub"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <GithubMark /> GitHub
            </a>
          </div>
        </div>
      </header>

      <Hero />

      <Examples />

      <main id="studio" className="mx-auto max-w-6xl px-5 py-6 grid gap-6 lg:grid-cols-[380px_1fr] scroll-mt-16">
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

      <HowItWorks />
      <Features />
      <UseCases />
      <FAQ />
      <SiteFooter />
    </div>
  )
}
