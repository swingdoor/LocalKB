import type { Editor } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { isRootBlockNodeType } from './nodeCatalog'

export interface RootBlockCommandTarget {
  pos: number
  nodeType: string
  nodeId: string | null
}

export function createRootBlockTarget(node: ProseMirrorNode, pos: number): RootBlockCommandTarget | null {
  if (!isRootBlockNodeType(node.type.name)) return null
  return {
    pos,
    nodeType: node.type.name,
    nodeId: typeof node.attrs.nodeId === 'string' ? node.attrs.nodeId : null,
  }
}

export function resolveRootBlockTarget(editor: Editor, target: RootBlockCommandTarget) {
  const node = editor.state.doc.nodeAt(target.pos)
  if (!node || node.type.name !== target.nodeType || !isRootBlockNodeType(node.type.name)) return null
  if (target.nodeId && node.attrs.nodeId !== target.nodeId) return null
  return node
}

function freshId() {
  return globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cloneWithFreshNodeIds(editor: Editor, node: ProseMirrorNode): ProseMirrorNode {
  const json = node.toJSON()
  const refresh = (value: Record<string, any>) => {
    if (value.attrs && Object.prototype.hasOwnProperty.call(value.attrs, 'nodeId')) {
      value.attrs.nodeId = freshId()
    }
    if (Array.isArray(value.content)) value.content.forEach(refresh)
  }
  refresh(json)
  return editor.state.schema.nodeFromJSON(json)
}

function focusNear(editor: Editor, transaction: typeof editor.state.tr, pos: number) {
  const resolved = transaction.doc.resolve(Math.max(0, Math.min(pos, transaction.doc.content.size)))
  return transaction.setSelection(TextSelection.near(resolved)).scrollIntoView()
}

export function insertParagraphAroundTarget(
  editor: Editor,
  target: RootBlockCommandTarget,
  side: 'before' | 'after',
) {
  const node = resolveRootBlockTarget(editor, target)
  const paragraph = editor.state.schema.nodes.paragraph
  if (!node || !paragraph) return false
  const insertPos = side === 'before' ? target.pos : target.pos + node.nodeSize
  const inserted = paragraph.create()
  editor.view.dispatch(focusNear(editor, editor.state.tr.insert(insertPos, inserted), insertPos + 1))
  editor.view.focus()
  return true
}

export function duplicateRootBlock(editor: Editor, target: RootBlockCommandTarget) {
  const node = resolveRootBlockTarget(editor, target)
  if (!node) return false
  const duplicate = cloneWithFreshNodeIds(editor, node)
  const insertPos = target.pos + node.nodeSize
  editor.view.dispatch(focusNear(editor, editor.state.tr.insert(insertPos, duplicate), insertPos + 1))
  editor.view.focus()
  return true
}

export function deleteRootBlock(editor: Editor, target: RootBlockCommandTarget) {
  const node = resolveRootBlockTarget(editor, target)
  if (!node) return false
  const transaction = editor.state.tr.delete(target.pos, target.pos + node.nodeSize)
  editor.view.dispatch(focusNear(editor, transaction, target.pos))
  editor.view.focus()
  return true
}

export function updateRootBlockAttrs(
  editor: Editor,
  target: RootBlockCommandTarget,
  attrs: Record<string, unknown>,
) {
  const node = resolveRootBlockTarget(editor, target)
  if (!node) return false
  editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, ...attrs }))
  editor.view.focus()
  return true
}

function selectInsideRootBlock(editor: Editor, target: RootBlockCommandTarget) {
  const node = resolveRootBlockTarget(editor, target)
  if (!node) return false
  let from: number | null = node.isTextblock ? target.pos + 1 : null
  let to: number | null = node.isTextblock ? target.pos + 1 + node.content.size : null

  if (!node.isTextblock) {
    node.descendants((child, relativePos) => {
      if (!child.isTextblock) return
      const textStart = target.pos + 1 + relativePos + 1
      if (from === null) from = textStart
      to = textStart + child.content.size
    })
  }

  if (from === null || to === null) return false
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)))
  return true
}

export function convertTextRootBlock(
  editor: Editor,
  target: RootBlockCommandTarget,
  type: 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote' | 'codeBlock',
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6 = 1,
) {
  const rootNode = resolveRootBlockTarget(editor, target)
  const compatibleSources = new Set([
    'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock',
  ])
  if (!rootNode || !compatibleSources.has(rootNode.type.name)) return false
  if (!selectInsideRootBlock(editor, target)) return false
  const chain = editor.chain().focus()
  if (type === 'paragraph') {
    if (rootNode.type.name === 'bulletList') return chain.toggleBulletList().run()
    if (rootNode.type.name === 'orderedList') return chain.toggleOrderedList().run()
    if (rootNode.type.name === 'taskList') return chain.toggleTaskList().run()
    if (rootNode.type.name === 'blockquote') return chain.toggleBlockquote().run()
    return chain.setParagraph().run()
  }
  if (type === 'heading') return chain.setHeading({ level: headingLevel }).run()
  if (type === 'bulletList') return chain.toggleBulletList().run()
  if (type === 'orderedList') return chain.toggleOrderedList().run()
  if (type === 'taskList') return chain.toggleTaskList().run()
  if (type === 'blockquote') return chain.toggleBlockquote().run()
  return chain.setCodeBlock().run()
}

export function unwrapDetailsRootBlock(editor: Editor, target: RootBlockCommandTarget) {
  const node = resolveRootBlockTarget(editor, target)
  if (!node || node.type.name !== 'details') return false
  const summary = node.childCount > 0 ? node.child(0) : null
  const content = node.childCount > 1 ? node.child(1) : null
  const paragraphType = editor.state.schema.nodes.paragraph
  if (!paragraphType) return false
  const replacement: ProseMirrorNode[] = []
  if (summary) replacement.push(paragraphType.create(null, summary.content))
  if (content) content.forEach((child) => replacement.push(child))
  if (replacement.length === 0) replacement.push(paragraphType.create())
  editor.view.dispatch(editor.state.tr.replaceWith(
    target.pos,
    target.pos + node.nodeSize,
    Fragment.fromArray(replacement),
  ).scrollIntoView())
  editor.view.focus()
  return true
}

export function setAllTaskItems(editor: Editor, target: RootBlockCommandTarget, checked: boolean) {
  const node = resolveRootBlockTarget(editor, target)
  if (!node || node.type.name !== 'taskList') return false
  let transaction = editor.state.tr
  node.descendants((child, relativePos) => {
    if (child.type.name === 'taskItem') {
      transaction = transaction.setNodeMarkup(target.pos + 1 + relativePos, undefined, {
        ...child.attrs,
        checked,
      })
    }
  })
  editor.view.dispatch(transaction)
  editor.view.focus()
  return true
}
