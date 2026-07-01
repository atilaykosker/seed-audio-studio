import { Sparkles, Loader2 } from 'lucide-react'
import {
  Button,
  Textarea,
  Label,
  Slider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@/components/ui'
import { useStore } from '@/store/useStore'

const EXAMPLES = [
  'A two-host comedy podcast where one host confesses an embarrassing first-day-at-work story.',
  'A tense radio drama: a detective confronts a suspect in a rain-soaked alley at midnight.',
  'A calming sleep meditation guiding the listener down to a quiet shore at dusk.',
  'A 30-second upbeat advertisement for a fictional artisan coffee brand.',
]

export function BriefForm() {
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const run = useStore((s) => s.runStudio)
  const status = useStore((s) => s.status)
  const hasKey = useStore((s) => !!s.key)
  const library = useStore((s) => s.library)
  const busy = status === 'planning' || status === 'generating'

  const toggleVoice = (id: string) =>
    setBrief({
      voiceIds: brief.voiceIds.includes(id)
        ? brief.voiceIds.filter((x) => x !== id)
        : [...brief.voiceIds, id],
    })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="idea">Brief</Label>
        <Textarea
          id="idea"
          rows={5}
          placeholder="Describe the scene, story, or audio you want…"
          value={brief.idea}
          onChange={(e) => setBrief({ idea: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="text-left text-xs rounded-md border border-border/60 px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => setBrief({ idea: ex })}
            >
              {ex.length > 46 ? ex.slice(0, 44) + '…' : ex}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Target length: {brief.durationSec}s</Label>
          <Slider
            min={15}
            max={120}
            step={5}
            value={[brief.durationSec]}
            onValueChange={([v]) => setBrief({ durationSec: v })}
          />
        </div>
        <div className="space-y-2">
          <Label>Speakers</Label>
          <Select
            value={String(brief.speakers)}
            onValueChange={(v) => setBrief({ speakers: v === 'auto' ? 'auto' : (Number(v) as 1 | 2 | 3) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={brief.language} onValueChange={(v) => setBrief({ language: v as 'EN' | 'ZH' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EN">English</SelectItem>
              <SelectItem value="ZH">Chinese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="genre">Genre hint</Label>
          <Input
            id="genre"
            placeholder="optional"
            value={brief.genre}
            onChange={(e) => setBrief({ genre: e.target.value })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={brief.withVideo}
          onChange={(e) => setBrief({ withVideo: e.target.checked })}
          className="size-4 rounded border-border/60 accent-primary"
        />
        Also generate video (nano-banana + kling) — higher cost
      </label>

      {library.length > 0 && (
        <div className="space-y-2">
          <Label>Reference voices (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Pin uploaded/minted samples — the planner casts them as characters and binds them via @Audio.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {library.map((v) => {
              const on = brief.voiceIds.includes(v.id)
              return (
                <button
                  key={v.id}
                  onClick={() => toggleVoice(v.id)}
                  className={
                    'text-xs rounded-md border px-2 py-1 transition-colors ' +
                    (on
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground')
                  }
                >
                  {on ? '✓ ' : ''}
                  {v.name}
                  {v.source === 'uploaded' ? ' ↑' : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <Button className="w-full" disabled={busy} onClick={() => run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? 'Generating…' : hasKey ? 'Generate audio' : 'Add key & generate'}
      </Button>
    </div>
  )
}
