import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const addressableNodeTypes = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'taskList',
  'taskItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'horizontalRule',
  'hardBreak',
  'image',
  'mindmap',
  'canvasReference',
  'mindmapReference',
  'assetImage',
  'documentReference',
  'fileAttachment',
  'details',
  'detailsSummary',
  'detailsContent',
]

function createNodeId(): string {
  return crypto.randomUUID()
}

export const StableNodeId = Extension.create({
  name: 'stableNodeId',

  addGlobalAttributes() {
    return [{
      types: addressableNodeTypes,
      attributes: {
        nodeId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-node-id'),
          renderHTML: (attributes) => attributes.nodeId
            ? { 'data-node-id': attributes.nodeId }
            : {},
        },
      },
    }]
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('stableNodeId'),
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some((transaction) => transaction.docChanged)) return null
        const used = new Set<string>()
        const replacements: Array<{ position: number; nodeId: string }> = []
        newState.doc.descendants((node, position) => {
          if (node.isText || node.type.name === 'doc') return
          const existing = typeof node.attrs.nodeId === 'string' ? node.attrs.nodeId : ''
          if (existing && !used.has(existing)) {
            used.add(existing)
            return
          }
          let nodeId = createNodeId()
          while (used.has(nodeId)) nodeId = createNodeId()
          used.add(nodeId)
          replacements.push({ position, nodeId })
        })
        if (!replacements.length) return null
        const transaction = newState.tr
        replacements.forEach(({ position, nodeId }) => {
          const node = transaction.doc.nodeAt(position)
          if (node) transaction.setNodeMarkup(position, undefined, { ...node.attrs, nodeId })
        })
        return transaction
      },
    })]
  },
})
