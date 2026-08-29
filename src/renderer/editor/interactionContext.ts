import type { Editor } from '@tiptap/core'
import { isNodeRangeSelection } from '@tiptap/extension-node-range'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type SelectionBookmark } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'

export type InteractionGesture = 'nodeResizing' | 'resourcePanning'

export type InteractionPhase =
  | { kind: 'idle' }
  | { kind: InteractionGesture; nodeType?: string }
  | { kind: 'modalOpen'; source: string }

export type NodeMenuContextKind =
  | 'image'
  | 'asset-image'
  | 'attachment'
  | 'document-reference'
  | 'canvas'
  | 'mindmap'

export type EditorMenuContext =
  | { kind: 'none'; reason: string }
  | { kind: 'text-range'; from: number; to: number }
  | { kind: 'table'; from: number; to: number }
  | { kind: 'node'; menu: NodeMenuContextKind; nodeType: string; pos: number; node: ProseMirrorNode }

const NODE_MENU_BY_TYPE: Readonly<Record<string, NodeMenuContextKind>> = {
  image: 'image',
  assetImage: 'asset-image',
  fileAttachment: 'attachment',
  documentReference: 'document-reference',
  canvasReference: 'canvas',
  mindmapReference: 'mindmap',
}

function selectionContainsCodeBlock(state: EditorState): boolean {
  const { from, to, $from, $to } = state.selection
  if ($from.parent.type.name === 'codeBlock' || $to.parent.type.name === 'codeBlock') return true
  let containsCodeBlock = false
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'codeBlock') {
      containsCodeBlock = true
      return false
    }
    return undefined
  })
  return containsCodeBlock
}

/**
 * Single source of truth for contextual UI priority. The explicit
 * isNodeRangeSelection check follows Tiptap 3.30.5's official Node Range
 * extension; a NodeRangeSelection created by Drag Handle is never text UI.
 */
export function resolveEditorMenuContext({
  state,
  phase,
  editable = true,
}: {
  state: EditorState
  phase: InteractionPhase
  editable?: boolean
}): EditorMenuContext {
  if (!editable) return { kind: 'none', reason: 'disabled' }
  if (phase.kind === 'modalOpen') return { kind: 'none', reason: 'modal-open' }
  if (phase.kind === 'nodeResizing' || phase.kind === 'resourcePanning') {
    return { kind: 'none', reason: phase.kind }
  }
  const { selection } = state
  if (isNodeRangeSelection(selection)) return { kind: 'none', reason: 'node-range-selection' }
  if (selection instanceof CellSelection) {
    return { kind: 'table', from: selection.from, to: selection.to }
  }
  if (selection instanceof NodeSelection) {
    const nodeType = selection.node.type.name
    const menu = NODE_MENU_BY_TYPE[nodeType]
    return menu
      ? { kind: 'node', menu, nodeType, pos: selection.from, node: selection.node }
      : { kind: 'none', reason: `unsupported-node:${nodeType}` }
  }
  if (selection instanceof TextSelection && !selection.empty) {
    if (selectionContainsCodeBlock(state)) return { kind: 'none', reason: 'code-selection' }
    return { kind: 'text-range', from: selection.from, to: selection.to }
  }
  return { kind: 'none', reason: selection instanceof TextSelection ? 'cursor' : 'unsupported-selection' }
}

export type InteractionListener = () => void

export class EditorInteractionCoordinator {
  private phase: InteractionPhase = { kind: 'idle' }
  private readonly listeners = new Set<InteractionListener>()
  private readonly modalSources = new Set<string>()

  getSnapshot = (): InteractionPhase => this.phase

  subscribe = (listener: InteractionListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(next: InteractionPhase) {
    if (
      next.kind === this.phase.kind
      && (next.kind !== 'modalOpen' || (
        this.phase.kind === 'modalOpen'
        && next.source === this.phase.source
      ))
      && (!('nodeType' in next) || !('nodeType' in this.phase) || next.nodeType === this.phase.nodeType)
    ) return
    this.phase = next
    for (const listener of this.listeners) listener()
  }

  beginGesture(kind: InteractionGesture, nodeType?: string) {
    this.publish({ kind, nodeType })
  }

  endGesture(kind: InteractionGesture) {
    if (this.phase.kind === kind) this.publish({ kind: 'idle' })
  }

  setModalOpen(source: string, open: boolean) {
    if (open) this.modalSources.add(source)
    else this.modalSources.delete(source)
    const activeSource = this.modalSources.values().next().value as string | undefined
    this.publish(activeSource ? { kind: 'modalOpen', source: activeSource } : { kind: 'idle' })
  }

  reset() {
    this.modalSources.clear()
    this.publish({ kind: 'idle' })
  }
}

export function createEditorInteractionCoordinator() {
  return new EditorInteractionCoordinator()
}

export interface MenuFocusTarget {
  bookmark: SelectionBookmark
  nodeType: string | null
}

export function captureMenuFocusTarget(editor: Editor): MenuFocusTarget {
  const { selection } = editor.state
  return {
    bookmark: selection.getBookmark(),
    nodeType: selection instanceof NodeSelection ? selection.node.type.name : null,
  }
}

export function restoreMenuFocusTarget(editor: Editor, target: MenuFocusTarget): boolean {
  if (editor.isDestroyed) return false
  try {
    const selection = target.bookmark.resolve(editor.state.doc)
    if (target.nodeType) {
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== target.nodeType) return false
    }
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    editor.view.focus()
    return true
  } catch {
    return false
  }
}

export function preserveEditorSelectionOnPointerDown(event: { preventDefault: () => void }) {
  event.preventDefault()
}
