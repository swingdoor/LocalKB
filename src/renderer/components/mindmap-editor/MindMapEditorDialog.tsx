import type { ReactNode } from 'react'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

export function MindMapEditorDialog({
  open,
  status,
  error,
  onRequestClose,
  onPointerDownCapture,
  children,
}: {
  open: boolean
  status: string
  error: string | null
  onRequestClose: () => void
  onPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>
  children: ReactNode
}) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onRequestClose() }}>
    <DialogContent
      data-mindmap-dialog-content=""
      className="flex h-[min(760px,calc(100vh-3rem))] w-[min(1440px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0"
      onPointerDownCapture={onPointerDownCapture}
    >
      <DialogHeader className="border-b px-5 py-3 pr-12">
        <div className="flex items-center gap-3">
          <DialogTitle>编辑思维导图</DialogTitle>
          <Badge variant="secondary">{status}</Badge>
          {error && <span className="truncate text-sm text-destructive">{error}</span>}
        </div>
        <DialogDescription className="sr-only">编辑思维导图节点、结构、布局和关系。</DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
}
