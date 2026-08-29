import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState, type MouseEventHandler } from 'react'
import { createRootBlockTarget, type RootBlockCommandTarget } from '../editor/blockCommands'
import type { EditorInteractionCoordinator } from '../editor/interactionContext'
import { useEditorInteractionPhase } from '../editor/useEditorInteraction'
import BlockActionMenu from './editor-menus/BlockActionMenu'
import EditorBlockDragHandle from './EditorBlockDragHandle'

export default function EditorRootBlockControls({
  editor,
  interaction,
}: {
  editor: Editor
  interaction: EditorInteractionCoordinator
}) {
  const hoveredTargetRef = useRef<RootBlockCommandTarget | null>(null)
  const [menu, setMenu] = useState<{
    target: RootBlockCommandTarget
    position: { left: number; top: number }
  } | null>(null)
  const phase = useEditorInteractionPhase(interaction)
  const handleLockedRef = useRef(false)
  const handleHiddenRef = useRef(false)
  const setHandleLocked = useCallback((locked: boolean) => {
    if (editor.isDestroyed || handleLockedRef.current === locked) return
    handleLockedRef.current = locked
    editor.commands.setMeta('lockDragHandle', locked)
  }, [editor])

  const setHandleHidden = useCallback((hidden: boolean) => {
    if (editor.isDestroyed || handleHiddenRef.current === hidden) return
    handleHiddenRef.current = hidden
    editor.commands.setMeta('hideDragHandle', hidden)
  }, [editor])

  const handleNodeChange = useCallback((next: {
    node: ProseMirrorNode
    pos: number
  } | null) => {
    hoveredTargetRef.current = next ? createRootBlockTarget(next.node, next.pos) : null
  }, [])

  const closeMenu = useCallback(() => {
    setMenu(null)
    setHandleLocked(false)
  }, [setHandleLocked])

  const openMenu = useCallback<MouseEventHandler<HTMLSpanElement>>((event) => {
    event.preventDefault()
    event.stopPropagation()
    const target = hoveredTargetRef.current
    if (!target || editor.isDestroyed || phase.kind !== 'idle') return
    setHandleLocked(true)
    setMenu({ target, position: { left: event.clientX, top: event.clientY } })
  }, [editor, phase.kind, setHandleLocked])

  useEffect(() => {
    const suppressHandle = phase.kind === 'modalOpen'
      || phase.kind === 'nodeResizing'
      || phase.kind === 'resourcePanning'
    if (suppressHandle && menu) closeMenu()
    setHandleHidden(suppressHandle)
    setHandleLocked(suppressHandle || Boolean(menu))
  }, [closeMenu, menu, phase.kind, setHandleHidden, setHandleLocked])

  useEffect(() => () => {
    if (editor.isDestroyed) return
    if (handleHiddenRef.current) editor.commands.setMeta('hideDragHandle', false)
    if (handleLockedRef.current) editor.commands.setMeta('lockDragHandle', false)
  }, [editor])

  return (
    <>
      <EditorBlockDragHandle
        editor={editor}
        onNodeChange={handleNodeChange}
        onContextMenu={openMenu}
      />

      {menu && phase.kind === 'idle' && (
        <BlockActionMenu
          editor={editor}
          target={menu.target}
          position={menu.position}
          onClose={closeMenu}
        />
      )}
    </>
  )
}
