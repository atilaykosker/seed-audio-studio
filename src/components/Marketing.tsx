import { BookAudio, Users, Wand2, Mic, Sparkles, Film, Headphones, ChevronDown } from 'lucide-react'
import { useState } from 'react'

function scrollToStudio() {
  document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-5 pt-14 pb-10 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground mb-5">
        <BookAudio className="size-3.5 text-primary" /> Ebook → multi-voice audiobook, in your browser
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
        Turn your ebook into a <span className="text-primary">multi-voice AI audiobook</span>
      </h1>
      <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
        Paste a chapter or scene and Seed Audio Studio gives every character its own voice — with sound effects and
        atmosphere — in one click. A full-cast audiobook, not a single robotic narrator. Bring your own fal key; nothing
        leaves your browser.
      </p>
      <div className="mt-7 flex items-center justify-center gap-3">
        <button
          onClick={scrollToStudio}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="size-4" /> Generate an audiobook
        </button>
        <a
          href="#how-it-works"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          How it works
        </a>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Powered by ByteDance Seed Audio 1.0 · ~$0.1875/min · no signup
      </p>
    </section>
  )
}

const STEPS = [
  { n: 1, icon: BookAudio, t: 'Paste your chapter', d: 'Drop in a scene, chapter, or passage from your ebook — or just describe it.' },
  { n: 2, icon: Users, t: 'AI casts the voices', d: 'An LLM identifies every character and assigns each a distinct voice, then writes the audiobook script with effects.' },
  { n: 3, icon: Headphones, t: 'Get a full-cast audiobook', d: 'Seed Audio 1.0 generates the multi-voice narration with ambience and SFX. Play, download, or regenerate.' },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-5 py-12 border-t border-border/40">
      <h2 className="text-2xl font-semibold text-center">How to turn an ebook into an audiobook with AI</h2>
      <p className="text-center text-muted-foreground mt-2 text-sm">Three steps, about a minute, entirely in your browser.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-xl border border-border/60 p-5">
            <div className="flex items-center gap-2 text-primary">
              <s.icon className="size-5" />
              <span className="text-xs font-mono text-muted-foreground">STEP {s.n}</span>
            </div>
            <h3 className="mt-3 font-medium">{s.t}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: Users, t: 'A voice per character', d: 'Detects the narrator, protagonist, and every character, and casts a distinct AI voice for each — a true full-cast audiobook.' },
  { icon: Wand2, t: 'Effects & atmosphere, automatic', d: 'The planner weaves in fitting sound effects, ambience, and music straight from the text — no audio editing required.' },
  { icon: Mic, t: 'Bring your own voice', d: 'Upload a short sample and pin it as a reference; the AI casts your voice as a character via voice cloning.' },
  { icon: Film, t: 'Cinematic, multi-scene', d: 'Longer passages are split into scenes so every character actually speaks, then stitched into one audiobook.' },
]

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-12 border-t border-border/40">
      <h2 className="text-2xl font-semibold text-center">A full-cast audiobook generator, not a single narrator</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.t} className="rounded-xl border border-border/60 p-5 flex gap-4">
            <f.icon className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const USE_CASES = ['Fiction ebooks & novels', 'Radio dramas', 'Children’s stories', 'Podcasts & dialogue', 'Game & film scripts', 'Narration & explainer']

export function UseCases() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-12 border-t border-border/40 text-center">
      <h2 className="text-2xl font-semibold">What you can make</h2>
      <p className="text-muted-foreground mt-2 text-sm">From ebook chapters to scripts — anything with more than one voice.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {USE_CASES.map((u) => (
          <span key={u} className="rounded-full border border-border/60 px-3.5 py-1.5 text-sm text-muted-foreground">{u}</span>
        ))}
      </div>
    </section>
  )
}

const FAQS = [
  { q: 'How do I turn an ebook into an audiobook with AI?', a: 'Paste a chapter, scene, or passage from your ebook and click Generate. The AI identifies the characters, casts a distinct voice for each, and the Seed Audio 1.0 model produces a multi-voice audiobook with sound effects — all in your browser with your own fal.ai key.' },
  { q: 'Can AI give each character a different voice?', a: 'Yes. Seed Audio Studio detects every character in your text and assigns a unique voice to each, so the narrator and each character sound different — like a full-cast audiobook rather than a single narrator.' },
  { q: 'Can I use my own voice as the narrator?', a: 'Yes. Upload a short voice sample (up to 30 seconds) to the voice library and pin it as a reference in the brief. The planner casts your sample as a character and uses it as the reference voice via voice cloning.' },
  { q: 'Is it free?', a: 'The app is free and runs entirely in your browser. You bring your own fal.ai API key and pay fal directly — Seed Audio 1.0 costs about $0.1875 per minute of generated audio. Your key is stored only in your browser.' },
  { q: 'How is this different from ElevenLabs or other audiobook tools?', a: 'Most tools narrate with one voice you pick manually. Seed Audio Studio plans the whole scene automatically — it casts a different voice per character and bakes in sound effects, ambience, and music from a single prompt, producing a cinematic full-cast result in one click.' },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="mx-auto max-w-3xl px-5 py-12 border-t border-border/40">
      <h2 className="text-2xl font-semibold text-center">Frequently asked questions</h2>
      <div className="mt-7 space-y-2.5">
        {FAQS.map((f, i) => (
          <div key={i} className="rounded-xl border border-border/60 overflow-hidden">
            <button
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium hover:bg-accent/50 transition-colors"
              onClick={() => setOpen(open === i ? null : i)}
            >
              {f.q}
              <ChevronDown className={`size-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="px-4 pb-4 text-sm text-muted-foreground">{f.a}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40 mt-8">
      <div className="mx-auto max-w-5xl px-5 py-8 text-center text-xs text-muted-foreground">
        <p>
          Seed Audio Studio — an AI ebook-to-audiobook generator with a distinct voice per character. Browser-based,
          bring-your-own-key. Powered by ByteDance Seed Audio 1.0 on fal.ai.
        </p>
        <p className="mt-2">
          Open source (MIT) ·{' '}
          <a
            href="https://github.com/egebese/seed-audio-studio"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            View / fork on GitHub
          </a>
        </p>
      </div>
    </footer>
  )
}
