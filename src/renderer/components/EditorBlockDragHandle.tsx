import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { offset, type ComputePositionConfig } from '@floating-ui/dom'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { GripVertical } from 'lucide-react'
import { Component, type MouseEventHandler, type ReactNode, useCallback } from 'react'
import { isRootBlockNodeType } from '../editor/nodeCatalog'

interface EditorBlockDragHandleProps {
  editor: Editor
  onNodeChange?: (target: { node: ProseMirrorNode; pos: number } | null) => void
  onMenuRequest?: MouseEventHandler<HTMLSpanElement>
}

const ROOT_BLOCK_HANDLE_POSITION: ComputePositionConfig = {
  placement: 'left-start',
  strategy: 'absolute',
  middleware: [offset(10)],
}

class DragHandleErrorBoundary extends Component<{
  children: ReactNode
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Drag Handle 初始化失败，已保持正文编辑器可用', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Root-block grip only. Tiptap owns the complete native drag lifecycle.
 * A completed click may open block actions, while pointer movement continues
 * through the official dragstart/DataTransfer/NodeRangeSelection pipeline.
 */
export default function EditorBlockDragHandle({
  editor,
  onNodeChange,
  onMenuRequest,
}: EditorBlockDragHandleProps) {
  const handleNodeChange = useCallback(({ node, pos }: {
    node: ProseMirrorNode | null
    pos: number
  }) => {
    if (node && isRootBlockNodeType(node.type.name)) {
      onNodeChange?.({ node, pos })
      return
    }
    onNodeChange?.(null)
  }, [onNodeChange])

  if (editor.isDestroyed) return null

  return (
    <DragHandleErrorBoundary>
      <DragHandle
        editor={editor}
        nested={false}
        className="editor-drag-handle"
        computePositionConfig={ROOT_BLOCK_HANDLE_POSITION}
        onNodeChange={handleNodeChange}
      >
        <span
          aria-label="拖动根级块调整顺序，单击打开块操作"
          title="拖动调整顺序，单击或右键打开块操作"
          onClick={onMenuRequest}
          onContextMenu={onMenuRequest}
        >
          <GripVertical aria-hidden="true" size={16} />
        </span>
      </DragHandle>
    </DragHandleErrorBoundary>
  )
}
