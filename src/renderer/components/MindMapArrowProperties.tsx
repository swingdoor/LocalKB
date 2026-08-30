import type { Arrow } from 'mind-elixir'
import { Palette, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'
import { MIND_MAP_TEXT_COLORS, MindMapColorSwatches } from './MindMapStyleControls'
import { cn } from '../lib/utils'

interface MindMapArrowPropertiesProps {
  arrow: Arrow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPatch: (patch: Partial<Arrow>) => void
  portalContainer: HTMLElement | null
}

type ArrowStylePatch = Partial<NonNullable<Arrow['style']>>

const LINE_STYLES = [
  { label: '实线', value: undefined },
  { label: '虚线', value: '8 5' },
  { label: '点线', value: '2 4' },
] as const

const LINE_WIDTHS = [
  { label: '默认', value: undefined },
  { label: '细', value: 2 },
  { label: '中', value: 3 },
  { label: '粗', value: 4 },
] as const

function ChoiceGroup<T extends string | number | undefined>({
  name,
  value,
  choices,
  onChange,
}: {
  name: string
  value: T
  choices: readonly { label: string; value: T }[]
  onChange: (value: T) => void
}) {
  return <div className="flex gap-1">
    {choices.map((choice) => <Button
      key={choice.label}
      type="button"
      variant="outline"
      size="sm"
      aria-label={`${name}：${choice.label}`}
      aria-pressed={value === choice.value}
      className={cn('h-7 flex-1 px-2 text-xs', value === choice.value && 'border-primary bg-accent text-accent-foreground')}
      onClick={() => onChange(choice.value)}
    >{choice.label}</Button>)}
  </div>
}

export default function MindMapArrowProperties({ arrow, open, onOpenChange, onPatch, portalContainer }: MindMapArrowPropertiesProps) {
  const patch = (style: ArrowStylePatch) => {
    if (!arrow) return
    onPatch({ style: { ...arrow.style, ...style } })
  }

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="sm" disabled={!arrow}><Palette />关联样式</Button>
    </PopoverTrigger>
    <PopoverContent portalContainer={portalContainer} align="start" className="w-[300px] p-4 pointer-events-auto" data-mindmap-floating-control="">
      <div className="space-y-4">
        <section className="space-y-2.5">
          <Label className="text-xs font-medium">连线颜色</Label>
          <MindMapColorSwatches name="关联线颜色" value={arrow?.style?.stroke} options={MIND_MAP_TEXT_COLORS} onChange={(stroke) => patch({ stroke })} />
        </section>
        <Separator />
        <section className="space-y-2.5">
          <Label className="text-xs font-medium">文字颜色</Label>
          <MindMapColorSwatches name="关联文字颜色" value={arrow?.style?.labelColor} options={MIND_MAP_TEXT_COLORS} onChange={(labelColor) => patch({ labelColor })} />
        </section>
        <Separator />
        <section className="space-y-2.5">
          <Label className="text-xs font-medium">线型</Label>
          <ChoiceGroup name="关联线型" value={arrow?.style?.strokeDasharray} choices={LINE_STYLES} onChange={(strokeDasharray) => patch({ strokeDasharray })} />
        </section>
        <section className="space-y-2.5">
          <Label className="text-xs font-medium">粗细</Label>
          <ChoiceGroup name="关联线宽" value={arrow?.style?.strokeWidth} choices={LINE_WIDTHS} onChange={(strokeWidth) => patch({ strokeWidth })} />
        </section>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => patch({ stroke: undefined, labelColor: undefined, strokeDasharray: undefined, strokeWidth: undefined, opacity: undefined })}
        >
          <RotateCcw />恢复默认
        </Button>
      </div>
    </PopoverContent>
  </Popover>
}
