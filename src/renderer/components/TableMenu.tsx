import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { BubbleMenu, type BubbleMenuProps as TiptapBubbleMenuProps } from '@tiptap/react/menus'
import { CellSelection } from '@tiptap/pm/tables'
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  ChevronDown,
  Columns3,
  Combine,
  PanelLeft,
  PanelTop,
  Rows3,
  SplitSquareHorizontal,
  Table2,
} from 'lucide-react'
import type { EditorInteractionCoordinator } from '../editor/interactionContext'
import { resolveEditorMenuContext } from '../editor/interactionContext'
import { useEditorInteractionPhase } from '../editor/useEditorInteraction'

interface TableMenuProps {
  editor: Editor
  hidden?: boolean
  interaction: EditorInteractionCoordinator
}

interface TableActionsProps {
  editor: Editor
  onClose: () => void
  className?: string
  style?: CSSProperties
}

interface TableActionProps {
  icon: ReactNode
  label: string
  onSelect: () => void
  disabled?: boolean
}

function TableAction({ icon, label, onSelect, disabled = false }: TableActionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="table-action"
      onClick={onSelect}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function TableActions({ editor, onClose, className = '', style }: TableActionsProps) {
  const run = (command: () => void) => {
    command()
    onClose()
  }

  return (
    <div
      role="menu"
      aria-label="表格操作"
      className={`table-actions-menu ${className}`}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="table-actions-heading">行</div>
      <TableAction
        icon={<BetweenHorizontalStart />}
        label="在上方插入行"
        disabled={!editor.can().addRowBefore()}
        onSelect={() => run(() => editor.chain().focus().addRowBefore().run())}
      />
      <TableAction
        icon={<BetweenHorizontalEnd />}
        label="在下方插入行"
        disabled={!editor.can().addRowAfter()}
        onSelect={() => run(() => editor.chain().focus().addRowAfter().run())}
      />
      <TableAction
        icon={<Rows3 />}
        label="删除当前行"
        disabled={!editor.can().deleteRow()}
        onSelect={() => run(() => editor.chain().focus().deleteRow().run())}
      />

      <div className="table-actions-separator" />
      <div className="table-actions-heading">列</div>
      <TableAction
        icon={<BetweenVerticalStart />}
        label="在左侧插入列"
        disabled={!editor.can().addColumnBefore()}
        onSelect={() => run(() => editor.chain().focus().addColumnBefore().run())}
      />
      <TableAction
        icon={<BetweenVerticalEnd />}
        label="在右侧插入列"
        disabled={!editor.can().addColumnAfter()}
        onSelect={() => run(() => editor.chain().focus().addColumnAfter().run())}
      />
      <TableAction
        icon={<Columns3 />}
        label="删除当前列"
        disabled={!editor.can().deleteColumn()}
        onSelect={() => run(() => editor.chain().focus().deleteColumn().run())}
      />

      <div className="table-actions-separator" />
      <div className="table-actions-heading">单元格</div>
      <TableAction
        icon={<Combine />}
        label="合并选中的单元格"
        disabled={!editor.can().mergeCells()}
        onSelect={() => run(() => editor.chain().focus().mergeCells().run())}
      />
      <TableAction
        icon={<SplitSquareHorizontal />}
        label="拆分单元格"
        disabled={!editor.can().splitCell()}
        onSelect={() => run(() => editor.chain().focus().splitCell().run())}
      />

      <div className="table-actions-separator" />
      <div className="table-actions-heading">表格</div>
      <TableAction
        icon={<PanelTop />}
        label="切换表头行"
        disabled={!editor.can().toggleHeaderRow()}
        onSelect={() => run(() => editor.chain().focus().toggleHeaderRow().run())}
      />
      <TableAction
        icon={<PanelLeft />}
        label="切换表头列"
        disabled={!editor.can().toggleHeaderColumn()}
        onSelect={() => run(() => editor.chain().focus().toggleHeaderColumn().run())}
      />
    </div>
  )
}

function getCurrentTableRect(editor: Editor): DOMRect {
  const { node } = editor.view.domAtPos(editor.state.selection.from)
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest('table')?.getBoundingClientRect() ?? editor.view.dom.getBoundingClientRect()
}

function selectClickedTableCell(editor: Editor, pos: number): boolean {
  const resolved = editor.state.doc.resolve(pos)
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const nodeType = resolved.node(depth).type.name
    if (nodeType !== 'tableCell' && nodeType !== 'tableHeader') continue
    const cellPos = resolved.before(depth)
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cellPos)))
    editor.view.focus()
    return true
  }
  return false
}

function TableMenu({ editor, hidden = false, interaction }: TableMenuProps) {
  const phase = useEditorInteractionPhase(interaction)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null)

  const closeMenus = useCallback(() => {
    setTriggerOpen(false)
    setContextPosition(null)
  }, [])

  const getTableVirtualElement = useCallback(() => ({
    getBoundingClientRect: () => getCurrentTableRect(editor),
  }), [editor])

  const hideTableTrigger = useCallback(() => {
    setTriggerOpen(false)
  }, [])

  const tableMenuOptions = useMemo<NonNullable<TiptapBubbleMenuProps['options']>>(() => ({
    placement: 'top-start',
    offset: 8,
    onHide: hideTableTrigger,
  }), [hideTableTrigger])

  const shouldShowTableMenu = useCallback<NonNullable<TiptapBubbleMenuProps['shouldShow']>>(({ state, view, element }) => {
    const context = resolveEditorMenuContext({
      state,
      phase: interaction.getSnapshot(),
      editable: editor.isEditable,
    })
    return !hidden && !contextPosition && context.kind === 'table'
      && (view.hasFocus() || element.contains(document.activeElement))
  }, [contextPosition, editor, hidden, interaction])

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (hidden || interaction.getSnapshot().kind !== 'idle' || !target?.closest('table')) return

      event.preventDefault()
      const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!position) return
      const clickedCell = target.closest('td, th')
      if (!clickedCell?.classList.contains('selectedCell')) {
        if (!selectClickedTableCell(editor, position.pos)) return
      }
      if (!(editor.state.selection instanceof CellSelection)) return

      setTriggerOpen(false)
      setContextPosition({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 468)),
      })
    }

    editor.view.dom.addEventListener('contextmenu', handleContextMenu)
    return () => editor.view.dom.removeEventListener('contextmenu', handleContextMenu)
  }, [editor, hidden, interaction])

  useEffect(() => {
    if (!triggerOpen && !contextPosition) return

    const handlePointerDown = () => closeMenus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [triggerOpen, contextPosition, closeMenus])

  useEffect(() => {
    if (hidden || phase.kind !== 'idle') closeMenus()
  }, [hidden, phase.kind, closeMenus])

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="tableMenu"
        updateDelay={0}
        getReferencedVirtualElement={getTableVirtualElement}
        options={tableMenuOptions}
        shouldShow={shouldShowTableMenu}
      >
        <div
          className="table-menu-control"
          style={{ display: phase.kind === 'idle' && !contextPosition ? 'block' : 'none' }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="table-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={triggerOpen}
            onClick={() => setTriggerOpen(open => !open)}
          >
            <Table2 />
            <span>表格</span>
            <ChevronDown />
          </button>
          {triggerOpen && <TableActions editor={editor} onClose={closeMenus} />}
        </div>
      </BubbleMenu>

      {contextPosition && createPortal(
        <TableActions
          editor={editor}
          onClose={closeMenus}
          className="table-context-menu"
          style={{ left: contextPosition.x, top: contextPosition.y }}
        />,
        document.body,
      )}
    </>
  )
}

export default TableMenu
