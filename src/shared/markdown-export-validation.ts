import { TIPTAP_NODE_TYPES } from './knowledge-types'
import type { TipTapDocument, TipTapNode } from './knowledge-types'
import { assertTipTapDocument, assertUuid, KnowledgeValidationError } from './knowledge-validation'

export const MARKDOWN_EXPORT_SUPPORTED_NODE_TYPES = [
  'doc',
  'paragraph',
  'text',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'heading',
  'horizontalRule',
  'hardBreak',
  'codeBlock',
  'taskList',
  'taskItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'image',
  'canvasReference',
  'mindmapReference',
  'assetImage',
  'documentReference',
  'fileAttachment',
  'details',
  'detailsSummary',
  'detailsContent',
] as const satisfies typeof TIPTAP_NODE_TYPES

const SUPPORTED_NODE_TYPES = new Set<string>(MARKDOWN_EXPORT_SUPPORTED_NODE_TYPES)
const RESOURCE_NODE_TYPES = new Set<string>([
  'canvasReference',
  'mindmapReference',
  'assetImage',
  'documentReference',
  'fileAttachment',
])

function visit(node: TipTapNode, path: string): void {
  if (!SUPPORTED_NODE_TYPES.has(node.type)) {
    throw new KnowledgeValidationError(
      'INVALID_INPUT', `Markdown 导出不支持节点 ${path}: ${node.type}`,
    )
  }
  const needsNodeId = RESOURCE_NODE_TYPES.has(node.type) || (
    node.type === 'image' && typeof node.attrs?.src === 'string' && !/^https?:\/\//i.test(node.attrs.src)
  )
  if (needsNodeId) assertUuid(node.attrs?.nodeId, `Markdown 导出节点 ${path} 的 attrs.nodeId`)
  node.content?.forEach((child, index) => visit(child, `${path}.${index}`))
}

export function assertMarkdownExportDocument(value: unknown): asserts value is TipTapDocument {
  assertTipTapDocument(value)
  visit(value, 'root')
}
