import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BubbleMenu, Editor } from '@tiptap/react'
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
  Trash2,
} from 'lucide-react'

interface TableMenuProps {
  editor: Editor
  hidden?: boolean
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
  danger?: boolean
}

function TableAction({ icon, label, onSelect, disabled = false, danger = false }: TableActionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`table-action${danger ? ' is-danger' : ''}`}
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
      <TableAction
        icon={<Trash2 />}
        label="删除表格"
        danger
        disabled={!editor.can().deleteTable()}
        onSelect={() => run(() => editor.chain().focus().deleteTable().run())}
      />
    </div>
  )
}

function getCurrentTableRect(editor: Editor): DOMRect {
  const { node } = editor.view.domAtPos(editor.state.selection.from)
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest('table')?.getBoundingClientRect() ?? editor.view.dom.getBoundingClientRect()
}

function TableMenu({ editor, hidden = false }: TableMenuProps) {
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null)

  const closeMenus = () => {
    setTriggerOpen(false)
    setContextPosition(null)
  }

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (hidden || !target?.closest('table')) return

      event.preventDefault()
      const position = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      const clickedCell = target.closest('td, th')
      if (position && !clickedCell?.classList.contains('selectedCell')) {
        editor.chain().focus().setTextSelection(position.pos).run()
      }

      setTriggerOpen(false)
      setContextPosition({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 468)),
      })
    }

    editor.view.dom.addEventListener('contextmenu', handleContextMenu)
    return () => editor.view.dom.removeEventListener('contextmenu', handleContextMenu)
  }, [editor, hidden])

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
  }, [triggerOpen, contextPosition])

  useEffect(() => {
    if (hidden) closeMenus()
  }, [hidden])

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="tableMenu"
        tippyOptions={{
          duration: 100,
          placement: 'top-start',
          maxWidth: 'none',
          getReferenceClientRect: () => getCurrentTableRect(editor),
          onHidden: () => setTriggerOpen(false),
        }}
        shouldShow={({ view, element }) => (
          !hidden
          && editor.isEditable
          && editor.isActive('table')
          && (view.hasFocus() || element.contains(document.activeElement))
        )}
      >
        <div className="table-menu-control" onPointerDown={(event) => event.stopPropagation()}>
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
