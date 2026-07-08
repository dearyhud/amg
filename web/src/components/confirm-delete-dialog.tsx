import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  confirmText,
  description,
  pending = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  confirmText: string
  description: string
  pending?: boolean
}) {
  const [typed, setTyped] = useState("")

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setTyped("")
      }}
    >
      <DialogContent className="rounded-none">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-widest uppercase">Confirm delete</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Type <span className="font-mono font-medium text-foreground normal-case">{confirmText}</span> to confirm
          </Label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="rounded-none font-mono"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none font-mono text-xs tracking-widest uppercase" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-none font-mono text-xs tracking-widest uppercase"
            disabled={typed !== confirmText || pending}
            onClick={() => {
              onConfirm()
              setTyped("")
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
