import type { Editor } from '@tiptap/core'
import { Download, Pencil, RefreshCw } from 'lucide-react'
import type { EditorInteractionCoordinator } from '../../editor/interactionContext'
import { updateNodeTargetAttrs } from '../../editor/nodeCommands'
import { downloadCanvasReference, downloadMindMapReference } from '../../utils/resourceDownload'
import { AlignmentButtons, MenuButton, MenuDivider } from './MenuPrimitives'
import NodeMenuShell, { useSelectedNodeSnapshot } from './NodeMenuShell'

interface ResourceMenuProps {
  editor: Editor
  interaction: EditorInteractionCoordinator
  vaultId: string
  documentId: string
  onEdit: (resourceId: string) => void
}

function requestResourceReload(editor: Editor, resourceType: 'canvas' | 'mindmap', resourceId: string) {
  editor.view.dom.dispatchEvent(new CustomEvent('localkb:resource-preview-reload', {
    detail: { resourceType, resourceId },
  }))
}

export function CanvasMenu({ editor, interaction, vaultId, documentId, onEdit }: ResourceMenuProps) {
  const snapshot = useSelectedNodeSnapshot(editor, 'canvasReference')
  const target = snapshot?.target ?? null
  const attrs = snapshot?.attrs
  const canvasId = typeof attrs?.canvasId === 'string' ? attrs.canvasId : null
  const align = attrs?.textAlign === 'center' || attrs?.textAlign === 'right'
    ? attrs.textAlign
    : 'left'

  return (
    <NodeMenuShell editor={editor} interaction={interaction} nodeType="canvasReference" menuKind="canvas" pluginKey="canvasNodeMenu" label="画布操作">
      {canvasId && <MenuButton label="编辑画布" onClick={() => onEdit(canvasId)}><Pencil className="h-4 w-4" /></MenuButton>}
      <MenuDivider />
      {target && <AlignmentButtons value={align} onChange={(textAlign) => updateNodeTargetAttrs(editor, target, { textAlign })} />}
      <MenuDivider />
      {canvasId && (
        <>
          <MenuButton label="重新加载预览" onClick={() => requestResourceReload(editor, 'canvas', canvasId)}><RefreshCw className="h-4 w-4" /></MenuButton>
          <MenuButton label="导出画布" onClick={() => void downloadCanvasReference(vaultId, documentId, canvasId)}><Download className="h-4 w-4" /></MenuButton>
        </>
      )}
    </NodeMenuShell>
  )
}

export function MindMapMenu({ editor, interaction, vaultId, documentId, onEdit }: ResourceMenuProps) {
  const snapshot = useSelectedNodeSnapshot(editor, 'mindmapReference')
  const target = snapshot?.target ?? null
  const attrs = snapshot?.attrs
  const mindmapId = typeof attrs?.mindmapId === 'string' ? attrs.mindmapId : null
  const align = attrs?.textAlign === 'center' || attrs?.textAlign === 'right'
    ? attrs.textAlign
    : 'left'

  return (
    <NodeMenuShell editor={editor} interaction={interaction} nodeType="mindmapReference" menuKind="mindmap" pluginKey="mindmapNodeMenu" label="思维导图操作">
      {mindmapId && <MenuButton label="编辑思维导图" onClick={() => onEdit(mindmapId)}><Pencil className="h-4 w-4" /></MenuButton>}
      <MenuDivider />
      {target && <AlignmentButtons value={align} onChange={(textAlign) => updateNodeTargetAttrs(editor, target, { textAlign })} />}
      <MenuDivider />
      {mindmapId && (
        <>
          <MenuButton label="重新加载预览" onClick={() => requestResourceReload(editor, 'mindmap', mindmapId)}><RefreshCw className="h-4 w-4" /></MenuButton>
          <MenuButton label="导出思维导图" onClick={() => void downloadMindMapReference(vaultId, documentId, mindmapId)}><Download className="h-4 w-4" /></MenuButton>
        </>
      )}
    </NodeMenuShell>
  )
}
