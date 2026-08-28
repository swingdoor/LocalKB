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

interface MenuState {
  id: string
  kind: StructureTreeNode['kind']
  name: string
  x: number
  y: number
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
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(1)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setHeight(Math.max(1, element.clientHeight))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, height }
}

interface TreeNodeRowProps extends NodeRendererProps<StructureTreeNode> {
  openMenu: (node: StructureTreeNode, button: HTMLButtonElement) => void
}

function TreeNodeRow({ node, style, dragHandle, openMenu }: TreeNodeRowProps) {
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
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`group flex h-8 min-w-0 items-center rounded-lg pr-1 text-sm transition-colors ${
        selected ? 'bg-selected text-primary' : 'hover:bg-gray-100'
      } ${node.willReceiveDrop ? 'outline outline-1 outline-primary' : ''}`}
    >
      {node.data.kind === 'group' ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={node.isOpen ? '折叠组' : '展开组'}
          className="flex h-6 w-5 flex-none items-center justify-center rounded text-gray-400 hover:text-gray-600"
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
        <Folder size={16} strokeWidth={1.8} className="mr-2 flex-none text-gray-500" />
      ) : node.data.contentType === 'canvas' ? (
        <ImageIcon size={16} strokeWidth={1.8} className="mr-2 flex-none text-amber-500" />
      ) : (
        <FileText size={16} strokeWidth={1.8} className="mr-2 flex-none text-blue-500" />
      )}

      {node.isEditing ? (
        <input
          ref={inputRef}
          defaultValue={node.data.name}
          aria-label="重命名"
          className="h-6 min-w-0 flex-1 rounded border border-primary bg-white px-1 text-sm outline-none"
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
        <button
          type="button"
          aria-label={`${node.data.name} 的更多操作`}
          className={`ml-1 flex h-6 w-6 flex-none items-center justify-center rounded text-gray-400 hover:bg-white/70 hover:text-gray-600 focus:opacity-100 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            openMenu(node.data, event.currentTarget)
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    </div>
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
  const { ref: treeContainerRef, height } = useElementHeight()
  const [addMenu, setAddMenu] = useState<{ x: number; y: number; parentId: string | null } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MenuState | null>(null)
  const [disabledHint, setDisabledHint] = useState<string | null>(null)
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

  const openNodeMenu = useCallback((node: StructureTreeNode, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setMenu({ id: node.id, kind: node.kind, name: node.name, x: rect.right + 4, y: rect.top })
  }, [])

  const NodeRenderer = useCallback(
    (props: NodeRendererProps<StructureTreeNode>) => (
      <TreeNodeRow {...props} openMenu={openNodeMenu} />
    ),
    [openNodeMenu],
  )

  const openAddMenu = (button: HTMLButtonElement, parentId: string | null) => {
    const rect = button.getBoundingClientRect()
    setMenu(null)
    setAddMenu({ x: rect.right + 4, y: rect.top, parentId })
  }

  const create = async (kind: 'group' | 'document' | 'canvas', parentId: string | null) => {
    setAddMenu(null)
    setMenu(null)
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

  const contentCount = menu?.kind === 'group'
    ? countDescendantContent(structure, menu.id)
    : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 flex-none items-center justify-between px-3">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>内容</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="搜索文档"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            title="搜索"
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            aria-label="新建内容"
            aria-haspopup="menu"
            onClick={(event) => openAddMenu(event.currentTarget, null)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            title="新建"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {structureError && (
        <div className="mx-3 mb-1 rounded bg-red-50 px-2 py-1 text-xs text-red-500" role="status">
          {structureError}
        </div>
      )}

      <div ref={treeContainerRef} className="min-h-0 flex-1 px-2 pb-1">
        {structureLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">正在加载…</div>
        ) : data.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">暂无内容</div>
        ) : (
          <Tree<StructureTreeNode>
            ref={treeRef}
            data={data}
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
        )}
      </div>

      {(addMenu || menu) && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default"
          aria-label="关闭菜单"
          onClick={() => {
            setAddMenu(null)
            setMenu(null)
          }}
        />
      )}

      {addMenu && (
        <div
          role="menu"
          className="fixed z-50 w-24 rounded-lg border border-border bg-white py-1 shadow-lg"
          style={{ left: addMenu.x, top: addMenu.y }}
        >
          <button role="menuitem" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void create('group', addMenu.parentId)}>新建组</button>
          <button role="menuitem" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void create('document', addMenu.parentId)}>新建文档</button>
          <button role="menuitem" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void create('canvas', addMenu.parentId)}>新建画布</button>
        </div>
      )}

      {menu && (
        <div
          role="menu"
          className="fixed z-50 w-24 rounded-lg border border-border bg-white py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.kind === 'group' && (
            <>
              <button role="menuitem" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void create('group', menu.id)}>新建组</button>
              <button role="menuitem" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void create('document', menu.id)}>新建文档</button>
              <button role="menuitem" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void create('canvas', menu.id)}>新建画布</button>
            </>
          )}
          <button
            role="menuitem"
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => {
              treeRef.current?.get(menu.id)?.edit()
              setMenu(null)
            }}
          >
            重命名
          </button>
          <button
            role="menuitem"
            aria-disabled={menu.kind === 'group' && contentCount > 0}
            aria-label={menu.kind === 'group' && contentCount > 0
              ? `删除组不可用：组内还有 ${contentCount} 项内容`
              : menu.kind === 'group' ? '删除组' : '删除'}
            title={menu.kind === 'group' && contentCount > 0
              ? `组内还有 ${contentCount} 项内容，请先移动或删除这些内容`
              : undefined}
            className={`w-full px-3 py-2 text-left text-sm ${
              menu.kind === 'group' && contentCount > 0
                ? 'cursor-not-allowed text-gray-300'
                : 'text-red-500 hover:bg-red-50'
            }`}
            onMouseEnter={() => {
              if (menu.kind === 'group' && contentCount > 0) {
                setDisabledHint(`组内还有 ${contentCount} 项内容，请先移动或删除这些内容`)
              }
            }}
            onMouseLeave={() => setDisabledHint(null)}
            onFocus={() => {
              if (menu.kind === 'group' && contentCount > 0) {
                setDisabledHint(`组内还有 ${contentCount} 项内容，请先移动或删除这些内容`)
              }
            }}
            onBlur={() => setDisabledHint(null)}
            onClick={() => {
              if (menu.kind === 'group' && contentCount > 0) return
              setDeleteTarget(menu)
              setMenu(null)
            }}
          >
            {menu.kind === 'group' ? '删除组' : '删除'}
          </button>
        </div>
      )}

      {disabledHint && menu && (
        <div
          role="tooltip"
          className="fixed z-[60] max-w-60 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: menu.x + 104,
            top: menu.y + 144,
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          {disabledHint}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="w-72 rounded-lg bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="mb-2 text-base font-medium">确认删除</h3>
            <p className="mb-4 text-sm text-gray-600">
              {deleteTarget.kind === 'group'
                ? `确定删除组“${deleteTarget.name}”及其中的空组吗？`
                : `确定删除“${deleteTarget.name}”吗？此操作不可恢复。`}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
                onClick={async () => {
                  if (deleteTarget.kind === 'group') await deleteGroup(deleteTarget.id)
                  else await deleteContent(deleteTarget.id)
                  setDeleteTarget(null)
                }}
              >
                删除
              </button>
              <button className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200" onClick={() => setDeleteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentTree
