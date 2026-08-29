import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CheckCheck,
  CircleOff,
  Copy,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Quote,
  RemoveFormatting,
  Trash2,
} from 'lucide-react'
import type { RootBlockCommandTarget } from '../../editor/blockCommands'
import {
  convertTextRootBlock,
  deleteRootBlock,
  duplicateRootBlock,
  insertParagraphAroundTarget,
  resolveRootBlockTarget,
  setAllTaskItems,
  unwrapDetailsRootBlock,
  updateRootBlockAttrs,
} from '../../editor/blockCommands'
import { getInteractionProfile } from '../../editor/interactionProfiles'

interface BlockActionMenuProps {
  editor: Editor
  target: RootBlockCommandTarget
  position: { left: number; top: number }
  onClose: () => void
}

function Action({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`editor-block-action ${danger ? 'is-danger' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default function BlockActionMenu({ editor, target, position, onClose }: BlockActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const node = resolveRootBlockTarget(editor, target)
  const profile = getInteractionProfile(target.nodeType)

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeOnPointerDown, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useEffect(() => {
    if (!node || !profile?.rootBlock) onClose()
  }, [node, onClose, profile?.rootBlock])

  if (!node || !profile?.rootBlock) return null

  const run = (command: () => unknown) => {
    command()
    onClose()
  }
  const conversion = profile.blockMenu
  const align = node.attrs.textAlign ?? 'left'
  const menuLeft = Math.max(8, Math.min(position.left, window.innerWidth - 228))
  const menuTop = Math.max(8, Math.min(position.top, window.innerHeight - 80))

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${target.nodeType} 块操作`}
      className="editor-block-actions-menu"
      style={{
        left: menuLeft,
        top: menuTop,
        maxHeight: Math.max(72, window.innerHeight - menuTop - 8),
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {(conversion === 'paragraph' || conversion === 'heading') && (
        <>
          <div className="editor-block-actions-heading">类型</div>
          <Action label="正文" icon={<RemoveFormatting />} onClick={() => run(() => convertTextRootBlock(editor, target, 'paragraph'))} />
          {([1, 2, 3, 4, 5, 6] as const).map((level) => (
            <Action key={level} label={`标题 ${level}`} onClick={() => run(() => convertTextRootBlock(editor, target, 'heading', level))} />
          ))}
          <Action label="无序列表" icon={<List />} onClick={() => run(() => convertTextRootBlock(editor, target, 'bulletList'))} />
          <Action label="有序列表" icon={<ListOrdered />} onClick={() => run(() => convertTextRootBlock(editor, target, 'orderedList'))} />
          <Action label="待办列表" icon={<ListChecks />} onClick={() => run(() => convertTextRootBlock(editor, target, 'taskList'))} />
          <Action label="引用" icon={<Quote />} onClick={() => run(() => convertTextRootBlock(editor, target, 'blockquote'))} />
          <div className="editor-block-actions-heading">对齐</div>
          <Action label="左对齐" icon={<AlignLeft />} onClick={() => run(() => updateRootBlockAttrs(editor, target, { textAlign: 'left' }))} />
          <Action label="居中" icon={<AlignCenter />} onClick={() => run(() => updateRootBlockAttrs(editor, target, { textAlign: 'center' }))} />
          <Action label="右对齐" icon={<AlignRight />} onClick={() => run(() => updateRootBlockAttrs(editor, target, { textAlign: 'right' }))} />
        </>
      )}

      {['bullet-list', 'ordered-list', 'task-list'].includes(conversion ?? '') && (
        <>
          <div className="editor-block-actions-heading">列表类型</div>
          <Action label="无序列表" icon={<List />} onClick={() => run(() => convertTextRootBlock(editor, target, 'bulletList'))} />
          <Action label="有序列表" icon={<ListOrdered />} onClick={() => run(() => convertTextRootBlock(editor, target, 'orderedList'))} />
          <Action label="待办列表" icon={<ListChecks />} onClick={() => run(() => convertTextRootBlock(editor, target, 'taskList'))} />
          <Action label="转为正文" icon={<RemoveFormatting />} onClick={() => run(() => convertTextRootBlock(editor, target, 'paragraph'))} />
        </>
      )}

      {conversion === 'ordered-list' && (
        <Action label="从 1 开始编号" icon={<ListOrdered />} onClick={() => run(() => updateRootBlockAttrs(editor, target, { start: 1 }))} />
      )}
      {conversion === 'task-list' && (
        <>
          <Action label="全部完成" icon={<CheckCheck />} onClick={() => run(() => setAllTaskItems(editor, target, true))} />
          <Action label="全部取消完成" icon={<CircleOff />} onClick={() => run(() => setAllTaskItems(editor, target, false))} />
        </>
      )}
      {conversion === 'blockquote' && (
        <Action label="解除引用" icon={<RemoveFormatting />} onClick={() => run(() => convertTextRootBlock(editor, target, 'paragraph'))} />
      )}
      {conversion === 'code-block' && (
        <Action label="转为正文" icon={<RemoveFormatting />} onClick={() => run(() => convertTextRootBlock(editor, target, 'paragraph'))} />
      )}
      {conversion === 'details' && (
        <Action label="解除折叠详情" icon={<RemoveFormatting />} onClick={() => run(() => unwrapDetailsRootBlock(editor, target))} />
      )}

      <div className="editor-block-actions-heading">块</div>
      <Action label="在上方插入段落" icon={<Plus />} onClick={() => run(() => insertParagraphAroundTarget(editor, target, 'before'))} />
      <Action label="在下方插入段落" icon={<Plus />} onClick={() => run(() => insertParagraphAroundTarget(editor, target, 'after'))} />
      <Action label="复制块" icon={<Copy />} onClick={() => run(() => duplicateRootBlock(editor, target))} />
      <Action label="删除块" icon={<Trash2 />} danger onClick={() => run(() => deleteRootBlock(editor, target))} />
      <span className="sr-only">当前对齐：{align}</span>
    </div>,
    document.body,
  )
}
