import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

export interface NodeCommandTarget {
  pos: number
  nodeType: string
  nodeId: string | null
}

export function captureSelectedNode(editor: Editor, nodeType: string): NodeCommandTarget | null {
  const { selection } = editor.state
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== nodeType) return null
  return {
    pos: selection.from,
    nodeType,
    nodeId: typeof selection.node.attrs.nodeId === 'string' ? selection.node.attrs.nodeId : null,
  }
}

export function resolveNodeCommandTarget(editor: Editor, target: NodeCommandTarget) {
  const node = editor.state.doc.nodeAt(target.pos)
  if (!node || node.type.name !== target.nodeType) return null
  if (target.nodeId && node.attrs.nodeId !== target.nodeId) return null
  return node
}

export function updateNodeTargetAttrs(
  editor: Editor,
  target: NodeCommandTarget,
  attrs: Record<string, unknown>,
): boolean {
  const node = resolveNodeCommandTarget(editor, target)
  if (!node) return false
  const transaction = editor.state.tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, ...attrs })
  transaction.setSelection(NodeSelection.create(transaction.doc, target.pos))
  editor.view.dispatch(transaction)
  editor.view.focus()
  return true
}

export function deleteNodeTarget(editor: Editor, target: NodeCommandTarget): boolean {
  const node = resolveNodeCommandTarget(editor, target)
  if (!node) return false
  editor.view.dispatch(editor.state.tr.delete(target.pos, target.pos + node.nodeSize).scrollIntoView())
  editor.view.focus()
  return true
}
