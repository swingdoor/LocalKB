import type { MindMapCapabilities } from '../../mindmap/mindMapCapabilities'
import type { MindMapSelection } from '../../mindmap/mindMapInteraction'

function Item({
  children, shortcut, destructive = false, onAction, disabled = false,
}: {
  children: React.ReactNode
  shortcut?: string
  destructive?: boolean
  onAction: () => void
  disabled?: boolean
}) {
  return <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className={`flex w-full select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ${destructive ? 'text-destructive' : ''}`}
    onClick={onAction}
  >
    <span className="min-w-0 flex-1">{children}</span>
    {shortcut && <span className="ml-4 text-xs text-muted-foreground">{shortcut}</span>}
  </button>
}

function Separator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-muted" />
}

export interface MindMapContextActions {
  addChild: (nodeId: string) => void
  addSiblingBefore: (nodeId: string) => void
  addSiblingAfter: (nodeId: string) => void
  insertParent: (nodeId: string) => void
  editNode: (nodeId: string) => void
  moveNode: (nodeId: string, direction: 'up' | 'down') => void
  copyNodes: (nodeIds: string[], cut: boolean) => void
  pasteToNode: (nodeId: string) => void
  toggleFocus: (nodeId: string) => void
  createRelation: (nodeId: string, bidirectional: boolean) => void
  createSummary: (nodeIds: string[]) => void
  deleteNodes: (nodeIds: string[]) => void
  openNodeStyle: (selection: MindMapSelection) => void
  openNodeMetadata: (selection: MindMapSelection) => void
  editArrow: (arrowId: string) => void
  toggleArrowDirection: (arrowId: string) => void
  reconnectArrow: (arrowId: string, endpoint: 'from' | 'to') => void
  openArrowStyle: (selection: MindMapSelection) => void
  deleteArrow: (arrowId: string) => void
  editSummary: (summaryId: string) => void
  openSummaryStyle: (selection: MindMapSelection) => void
  deleteSummary: (summaryId: string) => void
}

function NodeMenu({ selection, capabilities, focused, actions, finish }: {
  selection: Extract<MindMapSelection, { type: 'nodes' }>
  capabilities: MindMapCapabilities
  focused: boolean
  actions: MindMapContextActions
  finish: (action: () => void) => void
}) {
  const nodeId = selection.ids[0]
  return <>
    <Item shortcut="Tab" disabled={!capabilities.canAddChild} onAction={() => finish(() => actions.addChild(nodeId))}>新增子节点</Item>
    <Item disabled={!capabilities.canAddSibling} onAction={() => finish(() => actions.addSiblingBefore(nodeId))}>在前面新增同级节点</Item>
    <Item shortcut="Enter" disabled={!capabilities.canAddSibling} onAction={() => finish(() => actions.addSiblingAfter(nodeId))}>在后面新增同级节点</Item>
    <Item disabled={!capabilities.canInsertParent} onAction={() => finish(() => actions.insertParent(nodeId))}>插入父节点</Item>
    <Item shortcut="F2" disabled={!capabilities.canEditText} onAction={() => finish(() => actions.editNode(nodeId))}>编辑文字</Item>
    <Separator />
    <Item disabled={!capabilities.canMoveNode} onAction={() => finish(() => actions.moveNode(nodeId, 'up'))}>上移</Item>
    <Item disabled={!capabilities.canMoveNode} onAction={() => finish(() => actions.moveNode(nodeId, 'down'))}>下移</Item>
    <Separator />
    <Item disabled={!capabilities.canCopy} onAction={() => finish(() => actions.copyNodes(selection.ids, false))}>复制</Item>
    <Item disabled={!capabilities.canCut} onAction={() => finish(() => actions.copyNodes(selection.ids, true))}>剪切</Item>
    <Item disabled={!capabilities.canPaste} onAction={() => finish(() => actions.pasteToNode(nodeId))}>粘贴到当前节点</Item>
    <Separator />
    <Item disabled={!capabilities.canStyle} onAction={() => finish(() => actions.openNodeStyle(selection))}>节点样式</Item>
    <Item disabled={!capabilities.canEditMetadata} onAction={() => finish(() => actions.openNodeMetadata(selection))}>节点信息</Item>
    <Item disabled={!focused && !capabilities.canFocus} onAction={() => finish(() => actions.toggleFocus(nodeId))}>{focused ? '退出专注' : '专注当前节点'}</Item>
    <Item disabled={!capabilities.canCreateRelation} onAction={() => finish(() => actions.createRelation(nodeId, false))}>创建单向关联</Item>
    <Item disabled={!capabilities.canCreateRelation} onAction={() => finish(() => actions.createRelation(nodeId, true))}>创建双向关联</Item>
    <Separator />
    <Item destructive disabled={!capabilities.canDelete} onAction={() => finish(() => actions.deleteNodes(selection.ids))}>删除节点</Item>
  </>
}

function MultiNodeMenu({ selection, capabilities, actions, finish }: {
  selection: Extract<MindMapSelection, { type: 'nodes' }>
  capabilities: MindMapCapabilities
  actions: MindMapContextActions
  finish: (action: () => void) => void
}) {
  return <>
    <Item disabled={!capabilities.canStyle} onAction={() => finish(() => actions.openNodeStyle(selection))}>批量设置样式</Item>
    <Item disabled={!capabilities.canCopy} onAction={() => finish(() => actions.copyNodes(selection.ids, false))}>复制所选节点</Item>
    <Item disabled={!capabilities.canCut} onAction={() => finish(() => actions.copyNodes(selection.ids, true))}>剪切所选节点</Item>
    <Item disabled={!capabilities.canCreateSummary} onAction={() => finish(() => actions.createSummary(selection.ids))}>创建概要</Item>
    <Separator />
    <Item destructive disabled={!capabilities.canDelete} onAction={() => finish(() => actions.deleteNodes(selection.ids))}>删除所选节点</Item>
  </>
}

function ArrowMenu({ id, actions, finish }: { id: string; actions: MindMapContextActions; finish: (action: () => void) => void }) {
  const selection: MindMapSelection = { type: 'arrow', id }
  return <>
    <Item onAction={() => finish(() => actions.editArrow(id))}>编辑关联文案</Item>
    <Item onAction={() => finish(() => actions.toggleArrowDirection(id))}>切换单向 / 双向</Item>
    <Item onAction={() => finish(() => actions.openArrowStyle(selection))}>关联样式</Item>
    <Separator />
    <Item onAction={() => finish(() => actions.reconnectArrow(id, 'from'))}>更换起点</Item>
    <Item onAction={() => finish(() => actions.reconnectArrow(id, 'to'))}>更换终点</Item>
    <Separator />
    <Item destructive onAction={() => finish(() => actions.deleteArrow(id))}>删除关联</Item>
  </>
}

function SummaryMenu({ id, actions, finish }: { id: string; actions: MindMapContextActions; finish: (action: () => void) => void }) {
  const selection: MindMapSelection = { type: 'summary', id }
  return <>
    <Item onAction={() => finish(() => actions.editSummary(id))}>编辑概要文字</Item>
    <Item onAction={() => finish(() => actions.openSummaryStyle(selection))}>概要样式</Item>
    <Separator />
    <Item destructive onAction={() => finish(() => actions.deleteSummary(id))}>删除概要</Item>
  </>
}

export function MindMapContextMenu({
  selection, capabilities, point, focused, actions, onDismiss,
}: {
  selection: MindMapSelection
  capabilities: MindMapCapabilities
  point: { x: number; y: number }
  focused: boolean
  actions: MindMapContextActions
  onDismiss: () => void
}) {
  if (selection.type === 'none') return null
  const finish = (action: () => void) => {
    onDismiss()
    action()
  }
  return <div
    role="menu"
    tabIndex={-1}
    data-mindmap-context-menu=""
    data-mindmap-floating-control=""
    className="pointer-events-auto absolute max-h-[calc(100%-1rem)] w-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    style={{ left: point.x, top: point.y }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDismiss() } }}
  >
    {selection.type === 'nodes' && selection.ids.length === 1
      ? <NodeMenu selection={selection} capabilities={capabilities} focused={focused} actions={actions} finish={finish} />
      : selection.type === 'nodes'
        ? <MultiNodeMenu selection={selection} capabilities={capabilities} actions={actions} finish={finish} />
        : selection.type === 'arrow'
          ? <ArrowMenu id={selection.id} actions={actions} finish={finish} />
          : <SummaryMenu id={selection.id} actions={actions} finish={finish} />}
  </div>
}
