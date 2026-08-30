import type { NodeObj } from 'mind-elixir'
import { Palette, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'
import { Toggle } from './ui/toggle'
import { mergeNodeStylePatch } from '../mindmap/mindMapCommands'
import {
  createNodeBackground, createNodeBorder, nodeBackgroundColor, nodeBackgroundPattern,
  nodeBorderColor, nodeBorderStyle, type NodeBackgroundPattern, type NodeBorderStyle,
} from '../mindmap/mindMapNodeStyle'
import {
  MIND_MAP_BACKGROUND_COLORS, MIND_MAP_TEXT_COLORS, MindMapColorSwatches, MindMapPropertyRow,
} from './MindMapStyleControls'

const BORDER_STYLES: ReadonlyArray<{ label: string; value: NodeBorderStyle }> = [
  { label: '实线', value: 'solid' }, { label: '虚线', value: 'dashed' }, { label: '点线', value: 'dotted' },
]
const BACKGROUND_PATTERNS: ReadonlyArray<{ label: string; value: NodeBackgroundPattern }> = [
  { label: '纯色', value: 'solid' }, { label: '斜线', value: 'diagonal' }, { label: '横线', value: 'lines' },
]

interface MindMapNodePropertiesProps {
  nodeIds: string[]
  nodes: NodeObj[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPatch: (createPatch: (node: NodeObj) => Partial<NodeObj>) => void
  portalContainer: HTMLElement | null
}

export default function MindMapNodeProperties({
  nodeIds, nodes, open, onOpenChange, onPatch, portalContainer,
}: MindMapNodePropertiesProps) {
  const node = nodes[0]
  const patch = onPatch
  const patchStyle = (key: keyof NonNullable<NodeObj['style']>, value: string | undefined) => {
    patch((current) => mergeNodeStylePatch(current, { [key]: value }))
  }
  const currentBorderStyle = nodeBorderStyle(node?.style?.border)
  const currentBorderColor = nodeBorderColor(node?.style?.border)
  const currentBackgroundPattern = nodeBackgroundPattern(node?.style?.background)
  const currentBackgroundColor = nodeBackgroundColor(node?.style?.background)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={nodes.length === 0 || nodeIds.length === 0}><Palette />节点样式</Button>
      </PopoverTrigger>
      <PopoverContent portalContainer={portalContainer} align="start" className="w-[340px] p-4 pointer-events-auto" data-mindmap-floating-control="">
        <div className="space-y-4">
          <section className="space-y-2.5">
            <Label className="text-xs font-medium">文字颜色</Label>
            <MindMapColorSwatches name="文字颜色" value={node?.style?.color} options={MIND_MAP_TEXT_COLORS} onChange={(value) => patchStyle('color', value)} />
          </section>

          <Separator />

          <section className="space-y-2.5">
            <Label className="text-xs font-medium">边框</Label>
            <MindMapPropertyRow label="颜色">
            <MindMapColorSwatches name="边框颜色" value={currentBorderColor} options={MIND_MAP_TEXT_COLORS} onChange={(value) => patch((current) => mergeNodeStylePatch(current, { border: createNodeBorder(value, nodeBorderStyle(current.style?.border)) }))} />
            </MindMapPropertyRow>
            <MindMapPropertyRow label="线型">
              <div className="grid grid-cols-3 gap-1.5">
                {BORDER_STYLES.map((option) => <Toggle
                  key={option.value}
                  pressed={currentBorderStyle === option.value}
                  onPressedChange={(pressed) => pressed && patch((current) => mergeNodeStylePatch(current, { border: createNodeBorder(nodeBorderColor(current.style?.border), option.value) }))}
                  className="h-8 justify-center gap-1.5 px-2 text-xs"
                >
                  <span className="w-5 border-t-2 border-current" style={{ borderTopStyle: option.value }} />
                  {option.label}
                </Toggle>)}
              </div>
            </MindMapPropertyRow>
          </section>

          <Separator />

          <section className="space-y-2.5">
            <Label className="text-xs font-medium">背景</Label>
            <MindMapPropertyRow label="颜色">
              <MindMapColorSwatches name="背景颜色" value={currentBackgroundColor} options={MIND_MAP_BACKGROUND_COLORS} onChange={(value) => patch((current) => mergeNodeStylePatch(current, { background: createNodeBackground(value, nodeBackgroundPattern(current.style?.background)) }))} />
            </MindMapPropertyRow>
            <MindMapPropertyRow label="样式">
              <div className="grid grid-cols-3 gap-1.5">
                {BACKGROUND_PATTERNS.map((option) => <Toggle
                  key={option.value}
                  pressed={currentBackgroundPattern === option.value}
                  onPressedChange={(pressed) => pressed && patch((current) => mergeNodeStylePatch(current, { background: createNodeBackground(nodeBackgroundColor(current.style?.background), option.value) }))}
                  className="h-auto flex-col gap-1 py-1.5 text-xs"
                >
                  <span className="h-5 w-full rounded-sm border" style={{ background: createNodeBackground(currentBackgroundColor, option.value) ?? '#fff' }} />
                  {option.label}
                </Toggle>)}
              </div>
            </MindMapPropertyRow>
          </section>

          <Separator />

          <section className="space-y-2.5">
            <Label className="text-xs font-medium">分支颜色</Label>
            <MindMapColorSwatches name="分支颜色" value={node?.branchColor} options={MIND_MAP_TEXT_COLORS} onChange={(value) => patch(() => ({ branchColor: value }))} />
          </section>

          <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => patch(() => ({ style: {}, branchColor: undefined }))}>
            <RotateCcw />恢复默认
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
