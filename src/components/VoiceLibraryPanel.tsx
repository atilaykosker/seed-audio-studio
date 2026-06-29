import { useRef, useState } from 'react'
import { Trash2, Upload, Loader2, Mic } from 'lucide-react'
import { Button, Label } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { uid } from '@/lib/utils'
import { mapFalError } from '@/services/fal/errors'
import { trimTo, audioDuration } from '@/services/audio/trim'
import { uploadAsset } from '@/services/fal/client'

export function VoiceLibraryPanel() {
  const library = useStore((s) => s.library)
  const addVoice = useStore((s) => s.addVoice)
  const removeVoice = useStore((s) => s.removeVoice)
  const toast = useStore((s) => s.toast)
  const hasKey = useStore((s) => !!s.key)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onFile(file: File) {
    if (!hasKey) {
      toast({ kind: 'error', title: 'Add your key first' })
      return
    }
    setUploading(true)
    try {
      const trimmed = await trimTo(file, 28)
      const dur = await audioDuration(trimmed)
      const url = await uploadAsset(trimmed)
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 32) || 'Voice'
      addVoice({ id: uid(), name, voiceSpec: 'uploaded clip', url, durationSec: dur, source: 'uploaded', createdAt: Date.now() })
      toast({ kind: 'success', title: `Added "${name}" to library` })
    } catch (e) {
      const fe = mapFalError(e)
      toast({ kind: 'error', title: fe.title, message: fe.message })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Mic className="size-3.5" /> Voice library
        </Label>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload
        </Button>
      </div>

      {library.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Minted character voices appear here and are reused when a future scene needs the same name.
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {library.map((v) => (
            <div key={v.id} className="rounded-md border border-border/60 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{v.name}</span>
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => removeVoice(v.id)}
                  title="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {v.voiceSpec && <div className="text-[11px] text-muted-foreground line-clamp-2">{v.voiceSpec}</div>}
              <audio controls preload="none" src={v.url} className="w-full h-8" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
