'use client'

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

const STORY_EXAMPLES = [
  'A cartoon fox discovers a glowing lamp in a moonlit forest and gasps in wonder.',
  'A tense noir detective confronts a suspect in a rain-soaked alley at midnight.',
  'A 15-second upbeat advertisement for a fictional artisan coffee brand.',
  'A sci-fi pilot warns her crew as alarms flash across the cockpit.',
]
const BIO_EXAMPLES = [
  'Cristiano Ronaldo — from a small island to football stardom.',
  'Ada Lovelace, pioneer of computing.',
  'Marie Curie and her discovery of radioactivity.',
  'Nikola Tesla and the age of electricity.',
]

export function BriefForm() {
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const run = useStore((s) => s.runStudio)
  const status = useStore((s) => s.status)
  const hasKey = useStore((s) => !!s.key)
  const busy = status === 'planning' || status === 'generating'
  const isBio = brief.type === 'biography'
  const examples = isBio ? BIO_EXAMPLES : STORY_EXAMPLES

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Content type</Label>
        <Select value={brief.type} onValueChange={(v) => setBrief({ type: v as 'story' | 'biography' })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="story">Story</SelectItem>
            <SelectItem value="biography">Biography</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="idea">{isBio ? 'Who? (subject + focus)' : 'Brief'}</Label>
        <Textarea
          id="idea"
          rows={5}
          placeholder={isBio ? 'A person to tell the life story of…' : 'Describe the video you want…'}
          value={brief.idea}
          onChange={(e) => setBrief({ idea: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              className="cursor-pointer text-left text-xs rounded-md border border-border/60 px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setBrief({ idea: ex })}
            >
              {ex.length > 46 ? ex.slice(0, 44) + '…' : ex}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {isBio ? (
          <div className="space-y-2">
            <Label>Shot duration</Label>
            <Select value={String(brief.shotSec)} onValueChange={(v) => setBrief({ shotSec: Number(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4s</SelectItem>
                <SelectItem value="6">6s</SelectItem>
                <SelectItem value="8">8s</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="space-y-2">
          <Label>{isBio ? 'Narration language' : 'Language'}</Label>
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
          <Label htmlFor="genre">{isBio ? 'Style hint' : 'Genre hint'}</Label>
          <Input
            id="genre"
            placeholder="optional"
            value={brief.genre}
            onChange={(e) => setBrief({ genre: e.target.value })}
          />
        </div>
      </div>

      <VideoModelPicker />

      <Button variant="gradient" size="lg" className="w-full" disabled={busy} onClick={() => run()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? 'Generating…' : hasKey ? (isBio ? 'Generate biography' : 'Generate video') : 'Add key & generate'}
      </Button>
    </div>
  )
}
