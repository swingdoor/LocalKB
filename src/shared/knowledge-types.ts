export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue | undefined
}

export const TIPTAP_NODE_TYPES = [
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
] as const

export const TIPTAP_MARK_TYPES = [
  'bold',
  'code',
  'italic',
  'strike',
  'link',
  'textStyle',
  'underline',
  'highlight',
] as const

export const TIPTAP_REFERENCE_NODE_TYPES = {
  canvas: 'canvasReference',
  mindmap: 'mindmapReference',
  asset: 'assetImage',
  attachment: 'fileAttachment',
  document: 'documentReference',
} as const

export const EXCALIDRAW_ELEMENT_TYPES = [
  'selection',
  'rectangle',
  'diamond',
  'ellipse',
  'text',
  'line',
  'arrow',
  'freedraw',
  'image',
  'frame',
  'magicframe',
  'iframe',
  'embeddable',
] as const

export type TipTapNodeType = typeof TIPTAP_NODE_TYPES[number]
export type TipTapMarkType = typeof TIPTAP_MARK_TYPES[number]

export interface TipTapMark extends JsonObject {
  type: TipTapMarkType
  attrs?: JsonObject
}

export interface TipTapNode extends JsonObject {
  type: TipTapNodeType
  attrs?: JsonObject
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

export interface TipTapDocument extends TipTapNode {
  type: 'doc'
}

export interface ExcalidrawElement extends JsonObject {
  id: string
  type: string
}

export interface ExcalidrawScene extends JsonObject {
  type: 'excalidraw'
  version: number
  source: string
  elements: ExcalidrawElement[]
  appState: JsonObject
  files: Record<string, JsonObject>
}

export interface MindMapNodeData extends JsonObject {
  id: string
  topic: string
  children?: MindMapNodeData[]
}

export interface MindMapData extends JsonObject {
  nodeData: MindMapNodeData
}

export interface VaultV2 {
  schemaVersion: 2
  id: string
  name: string
  createdAt: string
}

export interface GroupEntryV2 {
  kind: 'group'
  id: string
  name: string
  parentId: string | null
  order: number
}

export type ContentType = 'document' | 'canvas'

export interface ContentEntryV2 {
  kind: 'content'
  id: string
  contentType: ContentType
  title: string
  parentId: string | null
  order: number
  createdAt: string
  metadataUpdatedAt: string
}

export type TreeEntryV2 = GroupEntryV2 | ContentEntryV2

export interface VaultTreeV2 {
  schemaVersion: 2
  entries: TreeEntryV2[]
}

export interface ContentSummary {
  id: string
  contentType: ContentType
  title: string
  parentId: string | null
  order: number
  createdAt: string
  updatedAt: string
}

export interface LoadedDocument extends ContentSummary {
  contentType: 'document'
  content: TipTapDocument
}

export interface LoadedCanvas extends ContentSummary {
  contentType: 'canvas'
  content: ExcalidrawScene
}

export type LoadedContent = LoadedDocument | LoadedCanvas

export type EmbeddedResourceType = 'canvas' | 'mindmap' | 'asset'

export interface DocumentReference {
  type: EmbeddedResourceType
  id: string
  nodeId: string
}

export interface InternalDocumentReference {
  documentId: string
  nodeId: string
  label?: string
}

export interface FileAttachmentReference {
  assetId: string
  nodeId: string
  fileName: string
  mimeType: string
  size: number
}

export interface AssetData {
  id: string
  mimeType: string
  bytes: Uint8Array
}

export interface SearchHit {
  id: string
  contentType: ContentType
  title: string
  path: string[]
  updatedAt: string
  snippet?: string
  nodeId?: string
}

export type MutationOrigin = 'renderer' | 'mcp' | 'system'
export type KnowledgeResourceType =
  | 'vault'
  | 'tree'
  | 'document'
  | 'canvas'
  | 'mindmap'
  | 'asset'

export interface KnowledgeChangeEvent {
  vaultId: string
  resourceType: KnowledgeResourceType
  resourceId: string
  change: 'created' | 'updated' | 'moved' | 'deleted'
  origin: MutationOrigin
  changedAt: string
}

export type KnowledgeErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_ID'
  | 'INVALID_NAME'
  | 'INVALID_INDEX'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CORRUPT_DATA'
  | 'UNSUPPORTED_VERSION'
  | 'MIGRATION_FAILED'
  | 'PATH_OUTSIDE_VAULT'
  | 'PERSISTENCE_ERROR'

export interface KnowledgeErrorData {
  code: KnowledgeErrorCode
  message: string
  details?: JsonValue
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: KnowledgeErrorData }

export interface DocumentNodePatch {
  attrs?: JsonObject
  unsetAttrs?: string[]
}

export interface CanvasElementPatch {
  id: string
  changes: JsonObject
}

export interface MindMapNodePatch {
  id: string
  changes: JsonObject
}

export interface DocumentNodeSnapshot {
  documentId: string
  nodeId: string
  parentNodeId: string | null
  index: number
  path: number[]
  node: TipTapNode
}

export interface DocumentSearchHit extends DocumentNodeSnapshot {
  matchCount: number
  matches: Array<{ from: number; to: number; text: string }>
}

export interface DocumentSearchResult {
  hits: DocumentSearchHit[]
  totalMatchCount: number
  matchedNodeCount: number
  truncated: boolean
}

export interface DocumentNodeUpdate {
  nodeId: string
  type?: TipTapNodeType
  attrs?: { set?: JsonObject; unset?: string[] }
  content?: TipTapNode[] | null
}

export interface CanvasElementSnapshot {
  element: ExcalidrawElement
  zIndex: number
}

export interface CanvasSearchHit extends CanvasElementSnapshot {
  matchCount: number
}

export interface CanvasSearchResult {
  hits: CanvasSearchHit[]
  totalMatchCount: number
  matchedElementCount: number
  truncated: boolean
}

export type CanvasPlacement =
  | { position: 'back' | 'front' }
  | { beforeElementId: string }
  | { afterElementId: string }

export interface CanvasUpdate {
  elementUpdates?: Array<{ elementId: string; set?: JsonObject; unset?: string[] }>
  elementOrder?: string[]
  appState?: { set?: JsonObject; unset?: string[] }
  files?: { set?: Record<string, JsonObject>; delete?: string[] }
}

export interface MindMapNodeSnapshot {
  node: MindMapNodeData
  nodeId: string
  parentNodeId: string | null
  index: number
  path: string[]
}

export interface MindMapSearchHit extends MindMapNodeSnapshot {
  matchCount: number
}

export interface MindMapSearchResult {
  hits: MindMapSearchHit[]
  totalMatchCount: number
  matchedNodeCount: number
  truncated: boolean
}

export interface MindMapNodeUpdate {
  nodeId: string
  set?: JsonObject
  unset?: string[]
}

export interface MindMapNodeMove {
  nodeId: string
  parentNodeId: string
  index?: number
}

export type CanvasResourceLocation =
  | { scope: 'top-level' }
  | { scope: 'embedded'; documentId: string }

export interface VaultResourceLocator {
  canvases: Map<string, CanvasResourceLocation>
  mindMaps: Map<string, { documentId: string }>
  assets: Map<string, { documentId: string }>
}
