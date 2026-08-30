import type { Arrow, NodeObj, Summary } from 'mind-elixir'
import {
  Braces, Download, Hand, Link2, ListPlus, Maximize2, MousePointer2, Network, Pencil,
  Plus, Redo2, Trash2, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react'
import type { MindMapCapabilities } from '../../mindmap/mindMapCapabilities'
import type { MindMapOverlayKind, MindMapSelection } from '../../mindmap/mindMapInteraction'
import type { MindMapExportFormat } from '../../mindmap/mindMapExport'
import MindMapArrowProperties from '../MindMapArrowProperties'
import MindMapNodeMetadata from '../MindMapNodeMetadata'
import MindMapNodeProperties from '../MindMapNodeProperties'
import MindMapSummaryProperties from '../MindMapSummaryProperties'
import { Button } from '../ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Separator } from '../ui/separator'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { MindMapViewportMode } from './MindMapViewport'

function ToolButton({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={label} {...props}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

export interface MindMapToolbarActions {
  undo: () => void
  redo: () => void
  addChild: (nodeId: string) => void
  addSiblingBefore: (nodeId: string) => void
  addSiblingAfter: (nodeId: string) => void
  editNode: (nodeId: string) => void
  deleteSelection: (selection: MindMapSelection) => void
  patchNodes: (ids: string[], createPatch: (node: NodeObj) => Partial<NodeObj>) => void
  patchNodeMetadata: (id: string, patch: Partial<NodeObj>) => void
  startRelation: (nodeId: string, bidirectional: boolean) => void
  createSummary: (ids: string[]) => void
  editArrow: (id: string) => void
  patchArrow: (id: string, patch: Partial<Arrow>) => void
  reconnectArrow: (id: string, endpoint: 'from' | 'to') => void
  editSummary: (id: string) => void
  patchSummary: (id: string, patch: { stroke?: string; labelColor?: string }) => void
  changeDirection: (value: string) => void
  toggleCompact: (value: boolean) => void
  expandSelection: (nodeId: string, expanded: boolean) => void
  expandAll: (expanded: boolean) => void
  zoomBy: (delta: number) => void
  resetZoom: () => void
  fit: () => void
  setMode: (mode: MindMapViewportMode) => void
  exportStatic: (format: MindMapExportFormat) => void
  openOverlay: (kind: MindMapOverlayKind) => void
  closeOverlay: () => void
}

export function MindMapToolbar({
  ready, selection, capabilities, nodes, arrow, summary, direction, compact, zoom, mode,
  overlayKind, floatingPortal, actions,
}: {
  ready: boolean
  selection: MindMapSelection
  capabilities: MindMapCapabilities
  nodes: NodeObj[]
  arrow: Arrow | null
  summary: Summary | null
  direction: 0 | 1 | 2 | 3
  compact: boolean
  zoom: number
  mode: MindMapViewportMode
  overlayKind: MindMapOverlayKind | null
  floatingPortal: HTMLElement | null
  actions: MindMapToolbarActions
}) {
  const nodeId = selection.type === 'nodes' && selection.ids.length === 1 ? selection.ids[0] : null
  const nodeIds = selection.type === 'nodes' ? selection.ids : []
  const setOverlay = (kind: MindMapOverlayKind, open: boolean) => open ? actions.openOverlay(kind) : actions.closeOverlay()

  return <div className="flex min-h-12 flex-wrap items-center gap-1 border-b px-3 py-1.5">
    <ToolButton label="撤销" disabled={!ready} onClick={actions.undo}><Undo2 /></ToolButton>
    <ToolButton label="重做" disabled={!ready} onClick={actions.redo}><Redo2 /></ToolButton>

    {capabilities.context !== 'none' && <Separator orientation="vertical" className="mx-1 h-6" />}
    {(capabilities.context === 'node' || capabilities.context === 'root-node') && nodeId && <>
      <ToolButton label="新增子节点" disabled={!capabilities.canAddChild} onClick={() => actions.addChild(nodeId)}><Plus /></ToolButton>
      <ToolButton label="在前面新增同级节点" disabled={!capabilities.canAddSibling} onClick={() => actions.addSiblingBefore(nodeId)}><ListPlus /></ToolButton>
      <ToolButton label="在后面新增同级节点" disabled={!capabilities.canAddSibling} onClick={() => actions.addSiblingAfter(nodeId)}><ListPlus /></ToolButton>
      <ToolButton label="编辑节点文字" disabled={!capabilities.canEditText} onClick={() => actions.editNode(nodeId)}><Pencil /></ToolButton>
      <ToolButton label="删除节点" disabled={!capabilities.canDelete} onClick={() => actions.deleteSelection(selection)}><Trash2 /></ToolButton>
      <MindMapNodeProperties
        nodeIds={nodeIds} nodes={nodes}
        open={overlayKind === 'node-style'} onOpenChange={(open) => setOverlay('node-style', open)}
        onPatch={(patch) => actions.patchNodes(nodeIds, patch)} portalContainer={floatingPortal}
      />
      <MindMapNodeMetadata
        node={nodes[0] ?? null} nodeId={nodeId}
        open={overlayKind === 'node-metadata'} onOpenChange={(open) => setOverlay('node-metadata', open)}
        onSave={(patch) => actions.patchNodeMetadata(nodeId, patch)} portalContainer={floatingPortal}
      />
      <ToolButton label="创建关联" disabled={!capabilities.canCreateRelation} onClick={() => actions.startRelation(nodeId, false)}><Link2 /></ToolButton>
    </>}
    {capabilities.context === 'multi-node' && <>
      <ToolButton label="删除所选节点" disabled={!capabilities.canDelete} onClick={() => actions.deleteSelection(selection)}><Trash2 /></ToolButton>
      <MindMapNodeProperties
        nodeIds={nodeIds} nodes={nodes}
        open={overlayKind === 'node-style'} onOpenChange={(open) => setOverlay('node-style', open)}
        onPatch={(patch) => actions.patchNodes(nodeIds, patch)} portalContainer={floatingPortal}
      />
      <ToolButton label="创建概要" disabled={!capabilities.canCreateSummary} onClick={() => actions.createSummary(nodeIds)}><Braces /></ToolButton>
    </>}
    {capabilities.context === 'arrow' && arrow && <>
      <ToolButton label="编辑关联文案" onClick={() => actions.editArrow(arrow.id)}><Pencil /></ToolButton>
      <MindMapArrowProperties
        arrow={arrow} open={overlayKind === 'arrow-style'}
        onOpenChange={(open) => setOverlay('arrow-style', open)}
        onPatch={(patch) => actions.patchArrow(arrow.id, patch)} portalContainer={floatingPortal}
      />
      <Button type="button" variant="ghost" size="sm" onClick={() => actions.reconnectArrow(arrow.id, 'from')}>更换起点</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => actions.reconnectArrow(arrow.id, 'to')}>更换终点</Button>
      <ToolButton label="删除关联" onClick={() => actions.deleteSelection(selection)}><Trash2 /></ToolButton>
    </>}
    {capabilities.context === 'summary' && summary && <>
      <ToolButton label="编辑概要文字" onClick={() => actions.editSummary(summary.id)}><Pencil /></ToolButton>
      <MindMapSummaryProperties
        summary={summary} open={overlayKind === 'summary-style'}
        onOpenChange={(open) => setOverlay('summary-style', open)}
        onPatch={(patch) => actions.patchSummary(summary.id, patch)} portalContainer={floatingPortal}
      />
      <ToolButton label="删除概要" onClick={() => actions.deleteSelection(selection)}><Trash2 /></ToolButton>
    </>}

    <Separator orientation="vertical" className="mx-1 h-6" />
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={!ready}><Network />布局</Button></DropdownMenuTrigger><DropdownMenuContent align="start">
      <DropdownMenuRadioGroup value={String(direction)} onValueChange={actions.changeDirection}>
        <DropdownMenuRadioItem value="2">双向</DropdownMenuRadioItem><DropdownMenuRadioItem value="0">向左</DropdownMenuRadioItem><DropdownMenuRadioItem value="1">向右</DropdownMenuRadioItem><DropdownMenuRadioItem value="3">向下</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator /><DropdownMenuCheckboxItem checked={compact} onCheckedChange={(value) => actions.toggleCompact(value === true)}>紧凑布局</DropdownMenuCheckboxItem>
    </DropdownMenuContent></DropdownMenu>
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={!ready}>展开</Button></DropdownMenuTrigger><DropdownMenuContent align="start">
      <DropdownMenuItem disabled={!capabilities.canExpand || !nodeId} onSelect={() => nodeId && actions.expandSelection(nodeId, true)}>展开当前节点</DropdownMenuItem>
      <DropdownMenuItem disabled={!capabilities.canExpand || !nodeId} onSelect={() => nodeId && actions.expandSelection(nodeId, false)}>折叠当前节点</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => actions.expandAll(true)}>全部展开</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => actions.expandAll(false)}>全部折叠</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
    <Separator orientation="vertical" className="mx-1 h-6" />
    <ToolButton label="缩小" disabled={!ready} onClick={() => actions.zoomBy(-0.1)}><ZoomOut /></ToolButton>
    <Button type="button" variant="ghost" size="sm" disabled={!ready} onClick={actions.resetZoom}>{Math.round(zoom * 100)}%</Button>
    <ToolButton label="放大" disabled={!ready} onClick={() => actions.zoomBy(0.1)}><ZoomIn /></ToolButton>
    <ToolButton label="自适应" disabled={!ready} onClick={actions.fit}><Maximize2 /></ToolButton>
    <Separator orientation="vertical" className="mx-1 h-6" />
    <ToggleGroup type="single" value={mode} onValueChange={(value) => value && actions.setMode(value as MindMapViewportMode)} variant="outline" size="sm" aria-label="画布交互模式">
      <ToggleGroupItem value="select" aria-label="选择工具" title="选择工具：拖动节点或在空白处框选"><MousePointer2 className="h-4 w-4" /></ToggleGroupItem>
      <ToggleGroupItem value="pan" aria-label="抓手工具" title="抓手工具；选择模式下也可按住空格临时拖动画布"><Hand className="h-4 w-4" /></ToggleGroupItem>
    </ToggleGroup>
    <div className="ml-auto flex items-center gap-1">
      <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={!ready} aria-label="导出思维导图"><Download /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.exportStatic('png')}>导出 PNG</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.exportStatic('svg')}>导出 SVG</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
  </div>
}
