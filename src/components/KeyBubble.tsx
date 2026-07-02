import { useState } from 'react'
import { KeyRound, Lock, ExternalLink, Settings, Check } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Label,
  Spinner,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { looksLikeKey, storeKey, validateKey } from '@/services/fal/keyStore'
import { mapFalError } from '@/services/fal/errors'
import { SettingsDialog } from '@/components/SettingsDialog'

export function KeyBubble() {
  const key = useStore((s) => s.key)
  const setKey = useStore((s) => s.setKey)
  const toast = useStore((s) => s.toast)
  const keyOpen = useStore((s) => s.keyDialogOpen)
  const setKeyOpen = useStore((s) => s.setKeyDialogOpen)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const k = value.trim()
    if (!looksLikeKey(k)) {
      setError("That doesn't look like a fal.ai key (format: id:secret).")
      return
    }
    setBusy(true)
    try {
      await validateKey(k)
      storeKey(k)
      setKey(k)
      setKeyOpen(false)
      toast({ kind: 'success', title: 'Key saved' })
    } catch (e) {
      setError(mapFalError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {key ? (
        <>
          <Button
            variant="outline"
            size="icon"
            title="Settings"
            aria-label="Settings — API key connected"
            onClick={() => setSettingsOpen(true)}
            className="relative rounded-full shadow-lg"
          >
            <Settings className="size-4" />
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-emerald-500 text-white"
            >
              <Check className="size-2.5" />
            </span>
          </Button>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </>
      ) : (
        <>
          <Button variant="gradient" className="rounded-full" onClick={() => setKeyOpen(true)}>
            <KeyRound className="size-4" /> Login with Fal key
          </Button>
          <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add your fal.ai key</DialogTitle>
                <DialogDescription>
                  Bring your own fal.ai key — it’s stored only in this browser and used to call
                  fal.ai directly from your device.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="bubble-key">Your fal.ai API key</Label>
                <Input
                  id="bubble-key"
                  type="password"
                  placeholder="xxxxxxxx-xxxx-…:xxxxxxxxxxxx"
                  value={value}
                  autoComplete="off"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
                <a
                  href="https://fal.ai/dashboard/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Where do I find this? <ExternalLink className="size-3" />
                </a>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button onClick={submit} disabled={busy} className="w-full">
                {busy ? <Spinner className="size-4" /> : 'Save key'}
              </Button>

              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                <p>Stored only in this browser; calls go straight to fal.ai.</p>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
