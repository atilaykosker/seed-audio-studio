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
import { VideoModelPicker } from '@/components/VideoModelPicker'
import { useStore } from '@/store/useStore'

const EXAMPLES = [
  'A cartoon fox discovers a glowing lamp in a moonlit forest and gasps in wonder.',
  'A tense noir detective confronts a suspect in a rain-soaked alley at midnight.',
  'A 15-second upbeat advertisement for a fictional artisan coffee brand.',
  'A sci-fi pilot warns her crew as alarms flash across the cockpit.',
]

export function BriefForm() {
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const run = useStore((s) => s.runStudio)
  const status = useStore((s) => s.status)
  const hasKey = useStore((s) => !!s.key)
  const busy = status === 'planning' || status === 'generating'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="idea">Brief</Label>
        <Textarea
          id="idea"
          rows={5}
          placeholder="Describe the video you want…"
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
          <Label>Orientation</Label>
          <Select
            value={brief.aspect ?? 'landscape'}
            onValueChange={(v) => setBrief({ aspect: v as 'landscape' | 'portrait' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="landscape">Landscape 16:9</SelectItem>
              <SelectItem value="portrait">Portrait 9:16</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label htmlFor="genre">Genre hint</Label>
          <Input
            id="genre"
            placeholder="optional"
            value={brief.genre}
            onChange={(e) => setBrief({ genre: e.target.value })}
          />
        </div>
      </div>

      <VideoModelPicker />

      <Button className="w-full" disabled={busy} onClick={() => run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? 'Generating…' : hasKey ? 'Generate video' : 'Add key & generate'}
      </Button>
    </div>
  )
}
