import { isNodeRangeSelection } from '@tiptap/extension-node-range'
import type { Slice } from '@tiptap/pm/model'
import { dropPoint } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'

function isRootNodeRange(view: EditorView): boolean {
  const { selection } = view.state
  return isNodeRangeSelection(selection)
    && selection.ranges.every(({ $from, $to }) => $from.depth === 0 && $to.depth === 0)
}

/**
 * Keep the official Drag Handle move lifecycle, but reject destinations inside
 * structural containers. `nested=false` limits the dragged source to a root
 * block; ProseMirror's default drop algorithm still needs this destination
 * guard to prevent a paragraph/list/table from being inserted into another
 * root block's nested content.
 */
export function handleRootBlockDrop(
  view: EditorView,
  event: DragEvent,
  slice: Slice,
  moved: boolean,
): boolean {
  if (!moved || !isRootNodeRange(view)) return false

  const eventPosition = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!eventPosition) return true

  const insertionPosition = dropPoint(view.state.doc, eventPosition.pos, slice)
  if (insertionPosition === null) return true

  return view.state.doc.resolve(insertionPosition).depth !== 0
}
