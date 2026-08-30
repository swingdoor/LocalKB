import type { Summary } from 'mind-elixir'
import { Palette, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'
import { MIND_MAP_TEXT_COLORS, MindMapColorSwatches } from './MindMapStyleControls'
interface MindMapSummaryPropertiesProps {
  summary: Summary | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPatch: (style: { stroke?: string; labelColor?: string }) => void
  portalContainer: HTMLElement | null
}

export default function MindMapSummaryProperties({ summary, open, onOpenChange, onPatch, portalContainer }: MindMapSummaryPropertiesProps) {
  const patch = (style: { stroke?: string; labelColor?: string }) => {
    if (!summary) return
    onPatch(style)
  }

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="sm" disabled={!summary}><Palette />概要样式</Button>
    </PopoverTrigger>
    <PopoverContent portalContainer={portalContainer} align="start" className="w-[300px] p-4 pointer-events-auto" data-mindmap-floating-control="">
      <div className="space-y-4">
        <section className="space-y-2.5">
          <Label className="text-xs font-medium">文字颜色</Label>
          <MindMapColorSwatches name="概要文字颜色" value={summary?.style?.labelColor} options={MIND_MAP_TEXT_COLORS} onChange={(labelColor) => patch({ labelColor })} />
        </section>
        <Separator />
        <section className="space-y-2.5">
          <Label className="text-xs font-medium">括号颜色</Label>
          <MindMapColorSwatches name="概要括号颜色" value={summary?.style?.stroke} options={MIND_MAP_TEXT_COLORS} onChange={(stroke) => patch({ stroke })} />
        </section>
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => patch({ stroke: undefined, labelColor: undefined })}>
          <RotateCcw />恢复默认
        </Button>
      </div>
    </PopoverContent>
  </Popover>
}
