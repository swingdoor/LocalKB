import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adjustMoveIndex,
  Tree,
  type CursorProps,
  type NodeRendererProps,
  type TreeApi,
} from 'react-arborist'
import {
  ChevronRight,
  FileText,
  Folder,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import {
  buildTreeData,
  countDescendantContent,
  isInvalidMove,
  type StructureTreeNode,
} from '../utils/structureTree'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Alert, AlertDescription } from './ui/alert'
import { Skeleton } from './ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from './ui/context-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface DeleteTarget {
  id: string
  kind: StructureTreeNode['kind']
  name: string
}

function InsertionCursor({ top, left, indent }: CursorProps) {
  return (
    <div
      className="pointer-events-none absolute z-10 h-0.5 rounded-full"
      style={{
        top: top - 1,
        left,
        right: indent,
        backgroundColor: 'var(--primary-color)',
      }}
    />
  )
}

function useElementHeight() {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(1)
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), [])

  useEffect(() => {
    if (!element) return
    const update = () => setHeight(Math.max(1, element.clientHeight))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return { ref, element, height }
}

interface TreeNodeRowProps extends NodeRendererProps<StructureTreeNode> {
  create: (kind: 'group' | 'document' | 'canvas', parentId: string | null) => void
  rename: (id: string) => void
  requestDelete: (node: StructureTreeNode) => void
  descendantCount: (id: string) => number
}

function TreeNodeRow({ node, style, dragHandle, create, rename, requestDelete, descendantCount }: TreeNodeRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!node.isEditing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [node.isEditing])

  useEffect(() => {
    if (!node.willReceiveDrop || node.data.kind !== 'group' || node.isOpen) return
    const timer = window.setTimeout(() => node.open(), 650)
    return () => window.clearTimeout(timer)
  }, [node.willReceiveDrop, node.data.kind, node.isOpen, node])

  const selected = node.isSelected
  const deleteDisabled = node.data.kind === 'group' && descendantCount(node.data.id) > 0
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        ref={dragHandle}
        style={style}
        className={`group flex h-8 min-w-0 items-center rounded-md pr-1 text-sm transition-colors ${
          selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent'
        } ${node.willReceiveDrop ? 'outline outline-1 outline-ring' : ''}`}
      >
      {node.data.kind === 'group' ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={node.isOpen ? '折叠组' : '展开组'}
          className="flex h-6 w-5 flex-none items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            node.toggle()
          }}
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            className={`transition-transform ${node.isOpen ? 'rotate-90' : ''}`}
          />
        </button>
      ) : (
        <span className="h-6 w-5 flex-none" aria-hidden="true" />
      )}

      {node.data.kind === 'group' ? (
        <Folder size={16} strokeWidth={1.8} className="mr-2 flex-none text-muted-foreground" />
      ) : node.data.contentType === 'canvas' ? (
        <ImageIcon size={16} strokeWidth={1.8} className="mr-2 flex-none text-amber-500" />
      ) : (
        <FileText size={16} strokeWidth={1.8} className="mr-2 flex-none text-blue-500" />
      )}

      {node.isEditing ? (
        <Input
          ref={inputRef}
          defaultValue={node.data.name}
          aria-label="重命名"
          className="h-6 min-w-0 flex-1 px-1 text-sm"
          onClick={(event) => event.stopPropagation()}
          onBlur={() => node.reset()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') node.reset()
            if (event.key === 'Enter') node.submit(event.currentTarget.value)
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate" title={node.data.name}>
          {node.data.name}
        </span>
      )}

      {!node.isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${node.data.name} 的更多操作`}
              className={`ml-1 h-6 w-6 flex-none text-muted-foreground focus:opacity-100 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right">
            {node.data.kind === 'group' && (
              <>
                <DropdownMenuItem onSelect={() => create('group', node.data.id)}>新建组</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => create('document', node.data.id)}>新建文档</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => create('canvas', node.data.id)}>新建画布</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => rename(node.data.id)}>重命名</DropdownMenuItem>
            <DropdownMenuItem
              disabled={deleteDisabled}
              className="text-destructive focus:text-destructive"
              title={deleteDisabled ? '组内仍有内容，请先移动或删除这些内容' : undefined}
              onSelect={() => requestDelete(node.data)}
            >
              {node.data.kind === 'group' ? '删除组' : '删除'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {node.data.kind === 'group' && (
          <>
            <ContextMenuItem onSelect={() => create('group', node.data.id)}>新建组</ContextMenuItem>
            <ContextMenuItem onSelect={() => create('document', node.data.id)}>新建文档</ContextMenuItem>
            <ContextMenuItem onSelect={() => create('canvas', node.data.id)}>新建画布</ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => rename(node.data.id)}>重命名</ContextMenuItem>
        <ContextMenuItem
          disabled={deleteDisabled}
          className="text-destructive focus:text-destructive"
          title={deleteDisabled ? '组内仍有内容，请先移动或删除这些内容' : undefined}
          onSelect={() => requestDelete(node.data)}
        >
          {node.data.kind === 'group' ? '删除组' : '删除'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DocumentTree() {
  const {
    currentVault,
    selectedContent,
    contents,
    structure,
    structureLoading,
    structureError,
    expandedGroupIds,
    revealContentId,
    createContent,
    selectContent,
    deleteContent,
    renameContent,
    createGroup,
    renameGroup,
    moveStructure,
    deleteGroup,
    setGroupExpanded,
    setSearchOpen,
    clearRevealContent,
  } = useAppStore()
  const treeRef = useRef<TreeApi<StructureTreeNode>>()
  const { ref: treeContainerRef, element: treeContainer, height } = useElementHeight()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [editAfterCreate, setEditAfterCreate] = useState<string | null>(null)

  const data = useMemo(
    () => buildTreeData(structure, contents),
    [structure, contents],
  )
  const initialOpenState = useMemo(
    () => Object.fromEntries(expandedGroupIds.map((id) => [id, true])),
    [currentVault?.id],
  )

  useEffect(() => {
    const tree = treeRef.current
    if (!tree) return
    for (const id of expandedGroupIds) tree.open(id)
  }, [expandedGroupIds, data])

  useEffect(() => {
    const tree = treeRef.current
    if (!tree || !revealContentId) return
    tree.select(revealContentId)
    void tree.scrollTo(revealContentId, 'center')
    clearRevealContent()
  }, [revealContentId, data, clearRevealContent])

  useEffect(() => {
    if (!editAfterCreate) return
    const node = treeRef.current?.get(editAfterCreate)
    if (!node) return
    node.edit()
    setEditAfterCreate(null)
  }, [editAfterCreate, data])

  const create = async (kind: 'group' | 'document' | 'canvas', parentId: string | null) => {
    if (kind === 'group') {
      const id = await createGroup(parentId)
      if (id) {
        if (parentId) treeRef.current?.open(parentId)
        setEditAfterCreate(id)
      }
      return
    }
    await createContent(undefined, kind, parentId)
  }

  const NodeRenderer = useCallback(
    (props: NodeRendererProps<StructureTreeNode>) => (
      <TreeNodeRow
        {...props}
        create={(kind, parentId) => void create(kind, parentId)}
        rename={(id) => treeRef.current?.get(id)?.edit()}
        requestDelete={(node) => setDeleteTarget({ id: node.id, kind: node.kind, name: node.name })}
        descendantCount={(id) => countDescendantContent(structure, id)}
      />
    ),
    [structure],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 flex-none items-center justify-between px-3">
        <span className="text-sm font-medium text-muted-foreground">内容</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="搜索文档" onClick={() => setSearchOpen(true)} className="h-7 w-7">
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>搜索</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="新建内容" className="h-7 w-7">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>新建</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void create('group', null)}>新建组</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void create('document', null)}>新建文档</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void create('canvas', null)}>新建画布</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {structureError && (
        <Alert variant="destructive" className="mx-3 mb-2 w-auto px-3 py-2">
          <AlertDescription className="text-xs">{structureError}</AlertDescription>
        </Alert>
      )}

      <div ref={treeContainerRef} className="min-h-0 flex-1 px-2 pb-1">
        {structureLoading ? (
          <div className="space-y-2 px-1 py-2" role="status" aria-label="正在加载文档结构">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无内容</div>
        ) : treeContainer ? (
          <Tree<StructureTreeNode>
            ref={treeRef}
            data={data}
            dndRootElement={treeContainer}
            width="100%"
            height={height}
            rowHeight={32}
            indent={14}
            paddingBottom={4}
            disableMultiSelection
            selection={selectedContent?.id}
            initialOpenState={initialOpenState}
            aria-label="文档结构"
            renderCursor={InsertionCursor}
            onActivate={(node) => {
              if (node.data.kind === 'group') node.toggle()
              else void selectContent(node.data.summary)
            }}
            onToggle={(id) => setGroupExpanded(id, treeRef.current?.isOpen(id) ?? false)}
            onRename={async ({ id, name, node }) => {
              const title = name.trim()
              if (!title) return
              if (node.data.kind === 'group') await renameGroup(id, title)
              else await renameContent(id, title)
            }}
            onMove={async ({ dragIds, dragNodes, parentId, index }) => {
              const dragged = dragNodes[0]
              if (!dragged || dragIds.length !== 1 || !structure) return
              const siblingIds = structure.entries
                .filter((entry) => entry.parentId === parentId)
                .sort((a, b) => a.order - b.order)
                .map((entry) => entry.id)
              const adjustedIndex = adjustMoveIndex({ index, dragIds, siblingIds })
              await moveStructure({
                id: dragged.id,
                targetParentId: parentId,
                index: adjustedIndex,
              })
            }}
            disableDrop={({ parentNode, dragNodes }) => {
              if (dragNodes.length !== 1) return true
              const parentId = parentNode.isRoot ? null : parentNode.id
              return isInvalidMove(structure, dragNodes[0].id, parentId)
            }}
          >
            {NodeRenderer}
          </Tree>
        ) : null}
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'group'
                ? '该组及其下的空组将被删除。'
                : '此内容将被永久删除，操作无法撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return
                if (deleteTarget.kind === 'group') await deleteGroup(deleteTarget.id)
                else await deleteContent(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default DocumentTree
