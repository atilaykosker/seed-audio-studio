import { AudioLines, Loader2, Github } from 'lucide-react'

const REPO_URL = 'https://github.com/egebese/seed-audio-studio'
import { Badge, Card, CardContent, Separator } from '@/components/ui'
import { BriefForm } from '@/components/BriefForm'
import { VoiceLibraryPanel } from '@/components/VoiceLibraryPanel'
import { ClipCard } from '@/components/ClipCard'
import { Hero, HowItWorks, Features, UseCases, FAQ, SiteFooter } from '@/components/Marketing'
import { Examples } from '@/components/Examples'
import { useStore } from '@/store/useStore'

export function Studio() {
  const status = useStore((s) => s.status)
  const currentStep = useStore((s) => s.currentStep)
  const category = useStore((s) => s.category)
  const clips = useStore((s) => s.clips)

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
              <Github className="size-3.5" /> GitHub
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
            <CardContent className="pt-5">
              <VoiceLibraryPanel />
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
