import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { VIDEO_MODELS, getVideoModel } from '@/services/fal/client'
import { clipCost, formatUSD } from '@/lib/cost'

/** Picker for the video generation model. Shows each tier's price; description + per-shot estimate below. */
export function VideoModelPicker() {
  const videoModel = useStore((s) => s.videoModel)
  const setVideoModel = useStore((s) => s.setVideoModel)
  const selected = getVideoModel(videoModel)
  const shotSec = Math.min(8, selected.maxDurationSec)

  return (
    <div className="space-y-2">
      <Label>Video model</Label>
      <Select value={videoModel} onValueChange={setVideoModel}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIDEO_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label} · {formatUSD(m.pricePerSec)}/s{m.audio ? '' : ' · silent'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {selected.description} · ~{formatUSD(clipCost(selected.id, shotSec))}/shot ·{' '}
        {selected.audio ? 'native audio' : 'silent'}
      </p>
    </div>
  )
}
