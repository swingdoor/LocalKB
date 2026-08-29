import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus'
import { useEditorState } from '@tiptap/react'
import type { EditorInteractionCoordinator, NodeMenuContextKind } from '../../editor/interactionContext'
import { resolveEditorMenuContext } from '../../editor/interactionContext'
import { useEditorInteractionPhase } from '../../editor/useEditorInteraction'
import type { NodeCommandTarget } from '../../editor/nodeCommands'
import { MenuSurface } from './MenuPrimitives'

const NODE_MENU_OPTIONS = { placement: 'top', offset: 8 } satisfies NonNullable<BubbleMenuProps['options']>

export default function NodeMenuShell({
  editor,
  interaction,
  nodeType,
  menuKind,
  pluginKey,
  label,
  children,
}: {
  editor: Editor
  interaction: EditorInteractionCoordinator
  nodeType: string
  menuKind: NodeMenuContextKind
  pluginKey: string
  label: string
  children: ReactNode
}) {
  const phase = useEditorInteractionPhase(interaction)
  const menuRef = useRef<HTMLDivElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const selectionKey = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const { selection } = currentEditor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== nodeType) return null
      return `${selection.from}:${String(selection.node.attrs.nodeId ?? '')}`
    },
  })

  const getSelectedNodeFrame = useCallback(() => {
    const { selection } = editor.state
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== nodeType) return null
    const dom = editor.view.nodeDOM(selection.from)
    const element = dom instanceof Element ? dom : dom?.parentElement
    return element?.querySelector('[data-resource-selection-frame], .resizable-image-wrapper, .file-attachment')
      ?? element
  }, [editor, nodeType])

  useEffect(() => {
    setDismissed(false)
  }, [selectionKey])

  useEffect(() => {
    if (!selectionKey || phase.kind !== 'idle') return
    const dismissOutside = (event: PointerEvent) => {
      const { selection } = editor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== nodeType) return
      const eventTarget = event.target instanceof Node ? event.target : null
      if (!eventTarget || menuRef.current?.contains(eventTarget)) return
      const frame = getSelectedNodeFrame()
      if (frame?.contains(eventTarget)) {
        const isInternalControl = eventTarget instanceof Element && Boolean(eventTarget.closest(
          '[data-resource-control], [data-resource-viewport], .resize-handle, button, a, input, select, textarea',
        ))
        if (!isInternalControl) setDismissed(false)
        return
      }
      setDismissed(true)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [editor, getSelectedNodeFrame, nodeType, phase.kind, selectionKey])
  const shouldShow = useCallback<NonNullable<BubbleMenuProps['shouldShow']>>(({ state }) => {
    const context = resolveEditorMenuContext({
      state,
      phase: interaction.getSnapshot(),
      editable: editor.isEditable,
    })
    return context.kind === 'node' && context.nodeType === nodeType && context.menu === menuKind
  }, [editor, interaction, menuKind, nodeType])

  const getAnchor = useCallback(() => {
    const frame = getSelectedNodeFrame()
    if (!frame) return null
    return {
      contextElement: frame,
      getBoundingClientRect: () => frame.getBoundingClientRect(),
      getClientRects: () => frame.getClientRects(),
    }
  }, [getSelectedNodeFrame])

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={pluginKey}
      updateDelay={0}
      options={NODE_MENU_OPTIONS}
      getReferencedVirtualElement={getAnchor}
      shouldShow={shouldShow}
    >
      <MenuSurface
        ref={menuRef}
        aria-label={label}
        style={{ display: phase.kind === 'idle' && !dismissed ? 'flex' : 'none' }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setDismissed(true)
        }}
      >
        {children}
      </MenuSurface>
    </BubbleMenu>
  )
}

export function useSelectedNodeSnapshot(editor: Editor, nodeType: string): {
  target: NodeCommandTarget
  attrs: Record<string, any>
} | null {
  return useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const { selection } = currentEditor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== nodeType) return null
      return {
        target: {
          pos: selection.from,
          nodeType,
          nodeId: typeof selection.node.attrs.nodeId === 'string' ? selection.node.attrs.nodeId : null,
        },
        attrs: selection.node.attrs,
      }
    },
  })
}
