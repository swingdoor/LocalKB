import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type SlashCommandId =
  | `h${1 | 2 | 3 | 4 | 5 | 6}`
  | 'documentReference'
  | 'fileAttachment'
  | 'details'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'code'
  | 'table'
  | 'divider'
  | 'image'
  | 'canvas'
  | 'mindmap'

export type RootBlockNodeType =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'codeBlock'
  | 'table'
  | 'horizontalRule'
  | 'details'
  | 'image'
  | 'assetImage'
  | 'fileAttachment'
  | 'canvasReference'
  | 'mindmapReference'

export interface SlashCommandProfile {
  id: SlashCommandId
  title: string
  resultNodeTypes: readonly string[]
  scope: 'root-block' | 'inline'
}

const HEADING_COMMANDS = ([1, 2, 3, 4, 5, 6] as const).map((level) => ({
  id: `h${level}` as const,
  title: `H${level}`,
  resultNodeTypes: ['heading'] as const,
  scope: 'root-block' as const,
}))

/**
 * The slash menu is an insertion catalog. It records the node shape produced by
 * each command, but intentionally contains no post-insertion business actions.
 * `image` can produce the workspace-native assetImage or the legacy image node.
 */
export const SLASH_COMMAND_CATALOG: readonly SlashCommandProfile[] = [
  ...HEADING_COMMANDS,
  { id: 'documentReference', title: '文档引用', resultNodeTypes: ['documentReference'], scope: 'inline' },
  { id: 'fileAttachment', title: '附件', resultNodeTypes: ['fileAttachment'], scope: 'root-block' },
  { id: 'details', title: '折叠详情', resultNodeTypes: ['details'], scope: 'root-block' },
  { id: 'bullet', title: '无序列表', resultNodeTypes: ['bulletList'], scope: 'root-block' },
  { id: 'ordered', title: '有序列表', resultNodeTypes: ['orderedList'], scope: 'root-block' },
  { id: 'task', title: '待办事项', resultNodeTypes: ['taskList'], scope: 'root-block' },
  { id: 'quote', title: '引用', resultNodeTypes: ['blockquote'], scope: 'root-block' },
  { id: 'code', title: '代码块', resultNodeTypes: ['codeBlock'], scope: 'root-block' },
  { id: 'table', title: '表格', resultNodeTypes: ['table'], scope: 'root-block' },
  { id: 'divider', title: '分割线', resultNodeTypes: ['horizontalRule'], scope: 'root-block' },
  { id: 'image', title: '图片', resultNodeTypes: ['assetImage', 'image'], scope: 'root-block' },
  { id: 'canvas', title: '画布', resultNodeTypes: ['canvasReference'], scope: 'root-block' },
  { id: 'mindmap', title: '思维导图', resultNodeTypes: ['mindmapReference'], scope: 'root-block' },
] as const

export const SLASH_COMMAND_BY_ID = new Map(
  SLASH_COMMAND_CATALOG.map((profile) => [profile.id, profile] as const),
)

export const ROOT_BLOCK_NODE_TYPES: readonly RootBlockNodeType[] = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'table',
  'horizontalRule',
  'details',
  'image',
  'assetImage',
  'fileAttachment',
  'canvasReference',
  'mindmapReference',
] as const

const ROOT_BLOCK_NODE_TYPE_SET = new Set<string>(ROOT_BLOCK_NODE_TYPES)

export const NON_ROOT_NODE_TYPES = [
  'text',
  'hardBreak',
  'documentReference',
  'listItem',
  'taskItem',
  'tableRow',
  'tableCell',
  'tableHeader',
  'detailsSummary',
  'detailsContent',
] as const

export function isRootBlockNodeType(nodeType: string): nodeType is RootBlockNodeType {
  return ROOT_BLOCK_NODE_TYPE_SET.has(nodeType)
}

export interface RootBlockTarget {
  node: ProseMirrorNode
  pos: number
  index: number
}

/**
 * Resolves a root block by document position. A block-like node nested in a
 * list, table, blockquote or Details is deliberately never returned.
 */
export function findRootBlockAtPosition(doc: ProseMirrorNode, pos: number): RootBlockTarget | null {
  if (doc.type.name !== 'doc' || pos < 0 || pos > doc.content.size) return null

  let offset = 0
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index)
    const from = offset
    const to = offset + node.nodeSize
    if (pos >= from && pos < to) {
      return isRootBlockNodeType(node.type.name) ? { node, pos: from, index } : null
    }
    offset = to
  }
  return null
}
