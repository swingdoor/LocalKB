import type { Editor } from '@tiptap/core'
import type { EditorInteractionCoordinator } from '../../editor/interactionContext'
import { AssetImageMenu, ImageMenu } from './ImageMenus'
import { AttachmentMenu, DocumentReferenceMenu } from './ReferenceMenus'
import { CanvasMenu, MindMapMenu } from './ResourceMenus'
import TextSelectionMenu from './TextSelectionMenu'

interface EditorContextMenusProps {
  editor: Editor
  interaction: EditorInteractionCoordinator
  vaultId: string
  documentId: string
  onEditCanvas: (canvasId: string) => void
  onEditMindMap: (mindmapId: string) => void
  onOpenDocument: (documentId: string) => void
  onSelectDocument: () => Promise<{ documentId: string; label: string } | null>
  onPolish: (text: string) => void
  onExpand: (text: string) => void
  onCustom: (text: string) => void
}

export default function EditorContextMenus(props: EditorContextMenusProps) {
  const { editor, interaction, vaultId, documentId } = props
  return (
    <>
      <TextSelectionMenu
        editor={editor}
        interaction={interaction}
        onPolish={props.onPolish}
        onExpand={props.onExpand}
        onCustom={props.onCustom}
      />
      <ImageMenu editor={editor} interaction={interaction} vaultId={vaultId} documentId={documentId} />
      <AssetImageMenu editor={editor} interaction={interaction} vaultId={vaultId} documentId={documentId} />
      <AttachmentMenu editor={editor} interaction={interaction} />
      <DocumentReferenceMenu
        editor={editor}
        interaction={interaction}
        onOpen={props.onOpenDocument}
        onRetarget={props.onSelectDocument}
      />
      <CanvasMenu
        editor={editor}
        interaction={interaction}
        vaultId={vaultId}
        documentId={documentId}
        onEdit={props.onEditCanvas}
      />
      <MindMapMenu
        editor={editor}
        interaction={interaction}
        vaultId={vaultId}
        documentId={documentId}
        onEdit={props.onEditMindMap}
      />
    </>
  )
}
