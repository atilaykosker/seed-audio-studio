import { Trash2, KeyRound, Library } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Separator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { clearKey } from '@/services/fal/keyStore'
import { MODELS } from '@/services/fal/client'

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const setKey = useStore((s) => s.setKey)
  const clearResults = useStore((s) => s.clearResults)
  const clearCharacterLibrary = useStore((s) => s.clearCharacterLibrary)
  const toast = useStore((s) => s.toast)
  const model = useStore((s) => s.model)
  const setModel = useStore((s) => s.setModel)
  const charCount = useStore((s) => s.characterLibrary.length)

  function forgetKey() {
    clearKey()
    setKey(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your key and character library live only in this browser.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Planning model (OpenRouter)</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-2" />

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => {
              clearResults()
              toast({ kind: 'success', title: 'Results cleared' })
              onOpenChange(false)
            }}
          >
            <Trash2 className="size-4" /> Clear results
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clearCharacterLibrary()
              toast({ kind: 'success', title: 'Character library cleared' })
            }}
          >
            <Library className="size-4" /> Clear character library ({charCount})
          </Button>
          <Button variant="destructive" onClick={forgetKey}>
            <KeyRound className="size-4" /> Forget API key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
