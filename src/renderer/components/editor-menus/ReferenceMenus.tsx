import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ExternalLink, FilePenLine, RefreshCw, Trash2 } from 'lucide-react'
import type { EditorInteractionCoordinator } from '../../editor/interactionContext'
import {
  deleteNodeTarget,
  resolveNodeCommandTarget,
  updateNodeTargetAttrs,
} from '../../editor/nodeCommands'
import { MenuButton, MenuDivider } from './MenuPrimitives'
import NodeMenuShell, { useSelectedNodeSnapshot } from './NodeMenuShell'

interface AttachmentMenuProps {
  editor: Editor
  interaction: EditorInteractionCoordinator
}

export function AttachmentMenu({ editor, interaction }: AttachmentMenuProps) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const snapshot = useSelectedNodeSnapshot(editor, 'fileAttachment')
  const target = snapshot?.target ?? null
  const attrs = snapshot?.attrs
  const fileName = typeof attrs?.fileName === 'string' ? attrs.fileName : '附件'

  useEffect(() => {
    if (!snapshot) {
      setRenaming(false)
      setName('')
    }
  }, [snapshot])

  const saveName = () => {
    if (target && name.trim()) updateNodeTargetAttrs(editor, target, { fileName: name.trim() })
    setRenaming(false)
  }

  return (
    <NodeMenuShell editor={editor} interaction={interaction} nodeType="fileAttachment" menuKind="attachment" pluginKey="attachmentNodeMenu" label="附件操作">
      {renaming ? (
        <>
          <input
            autoFocus
            value={name}
            aria-label="附件显示名"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveName()
              if (event.key === 'Escape') setRenaming(false)
            }}
            className="w-52 border-0 bg-transparent px-2 text-sm outline-none"
          />
          <MenuButton label="保存显示名" onClick={saveName}>保存</MenuButton>
        </>
      ) : (
        <>
          {/* Open and Save As remain primary actions on the attachment card. */}
          <MenuButton label="修改显示名" onClick={() => { setName(fileName); setRenaming(true) }}><FilePenLine className="h-4 w-4" /></MenuButton>
        </>
      )}
    </NodeMenuShell>
  )
}

interface DocumentReferenceMenuProps {
  editor: Editor
  interaction: EditorInteractionCoordinator
  onOpen: (documentId: string) => void
  onRetarget: () => Promise<{ documentId: string; label: string } | null>
}

export function DocumentReferenceMenu({
  editor,
  interaction,
  onOpen,
  onRetarget,
}: DocumentReferenceMenuProps) {
  const snapshot = useSelectedNodeSnapshot(editor, 'documentReference')
  const target = snapshot?.target ?? null
  const attrs = snapshot?.attrs
  const documentId = typeof attrs?.documentId === 'string' ? attrs.documentId : null
  const label = String(attrs?.label ?? '文档引用')

  const retarget = async () => {
    if (!target) return
    const next = await onRetarget()
    if (next) updateNodeTargetAttrs(editor, target, next)
  }

  const convertToText = () => {
    if (!target || !resolveNodeCommandTarget(editor, target)) return
    const text = editor.state.schema.text(label)
    editor.view.dispatch(editor.state.tr.replaceWith(target.pos, target.pos + 1, text).scrollIntoView())
    editor.view.focus()
  }

  return (
    <NodeMenuShell editor={editor} interaction={interaction} nodeType="documentReference" menuKind="document-reference" pluginKey="documentReferenceMenu" label="文档引用操作">
      {documentId && <MenuButton label="打开引用文档" onClick={() => onOpen(documentId)}><ExternalLink className="h-4 w-4" /></MenuButton>}
      <MenuButton label="更换引用目标" onClick={() => void retarget()}><RefreshCw className="h-4 w-4" /></MenuButton>
      <MenuButton label="转为普通文本" onClick={convertToText}>文本</MenuButton>
      <MenuDivider />
      {target && <MenuButton label="删除文档引用" destructive onClick={() => deleteNodeTarget(editor, target)}><Trash2 className="h-4 w-4" /></MenuButton>}
    </NodeMenuShell>
  )
}
