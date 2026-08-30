import {
  EXCALIDRAW_ELEMENT_TYPES,
  TIPTAP_MARK_TYPES,
  TIPTAP_NODE_TYPES,
  TIPTAP_REFERENCE_NODE_TYPES,
} from './knowledge-types'
import type {
  AssetManifest,
  AssetManifestEntry,
  ExcalidrawElement,
  ExcalidrawScene,
  JsonObject,
  JsonValue,
  KnowledgeErrorCode,
  MindMapData,
  MindMapNodeData,
  TipTapDocument,
  TipTapNode,
} from './knowledge-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIPTAP_NODE_TYPE_SET = new Set<string>(TIPTAP_NODE_TYPES)
const TIPTAP_MARK_TYPE_SET = new Set<string>(TIPTAP_MARK_TYPES)
const TIPTAP_INLINE_NODE_TYPE_SET = new Set<string>([
  'text',
  'hardBreak',
  'documentReference',
])
const TIPTAP_BLOCK_NODE_TYPE_SET = new Set<string>([
  'paragraph',
  'blockquote',
  'bulletList',
  'orderedList',
  'heading',
  'horizontalRule',
  'codeBlock',
  'taskList',
  'table',
  'image',
  'canvasReference',
  'mindmapReference',
  'assetImage',
  'fileAttachment',
  'details',
])
const REFERENCE_ID_ATTRS = {
  [TIPTAP_REFERENCE_NODE_TYPES.canvas]: 'canvasId',
  [TIPTAP_REFERENCE_NODE_TYPES.mindmap]: 'mindmapId',
  [TIPTAP_REFERENCE_NODE_TYPES.asset]: 'assetId',
  [TIPTAP_REFERENCE_NODE_TYPES.attachment]: 'assetId',
  [TIPTAP_REFERENCE_NODE_TYPES.document]: 'documentId',
} as const

function assertNodeAttributeKeys(node: TipTapNode, path: string, allowed: string[]): void {
  const attributes = node.attrs ?? {}
  const unexpected = Object.keys(attributes).find((key) => !allowed.includes(key))
  if (unexpected) {
    throw new KnowledgeValidationError(
      'INVALID_INPUT', `TipTap 节点 ${path} (${node.type}) 包含不受支持的属性: ${unexpected}`,
    )
  }
}

function assertOptionalNodeId(node: TipTapNode, path: string): void {
  if (node.attrs?.nodeId !== undefined && node.attrs.nodeId !== null) {
    assertUuid(node.attrs.nodeId, `TipTap 节点 ${path} 的 attrs.nodeId`)
  }
}

export function assertMimeType(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' || value.length === 0 || value.length > 255 ||
    !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value)
  ) {
    throw new KnowledgeValidationError('INVALID_INPUT', `${label} 无效`)
  }
}

export function assertIsoTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label} 无效`)
  }
}

function assertHighlightColor(value: unknown, label: string): void {
  if (value === undefined || value === null) return
  if (
    typeof value !== 'string' || value.length > 64 ||
    !/^(#[0-9a-fA-F]{3,8}|[A-Za-z]{1,32}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\))$/.test(value)
  ) {
    throw new KnowledgeValidationError('INVALID_INPUT', `${label} 无效`)
  }
}

export class KnowledgeValidationError extends Error {
  constructor(
    public readonly code: KnowledgeErrorCode,
    message: string,
    public readonly details?: JsonValue,
  ) {
    super(message)
    this.name = 'KnowledgeValidationError'
  }
}

export function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.values(value).every(
      (item) => item !== undefined && isJsonValue(item, seen),
    )
  seen.delete(value)
  return valid
}

export function assertJsonObject(value: unknown, label = 'JSON 对象'): asserts value is JsonObject {
  if (!isPlainObject(value) || !isJsonValue(value)) {
    throw new KnowledgeValidationError('INVALID_INPUT', `${label}无效`)
  }
}

export function assertUuid(value: unknown, label = 'ID'): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new KnowledgeValidationError('INVALID_ID', `${label}无效`)
  }
}

export function assertNativeId(value: unknown, label = '原生 ID'): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new KnowledgeValidationError('INVALID_ID', `${label}无效`)
  }
}

export function assertPathSegment(value: unknown, label = '路径段'): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new KnowledgeValidationError('PATH_OUTSIDE_VAULT', `${label}无效`)
  }
}

export function normalizeName(value: unknown, label = '名称'): string {
  if (typeof value !== 'string') {
    throw new KnowledgeValidationError('INVALID_NAME', `${label}无效`)
  }
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 100) {
    throw new KnowledgeValidationError('INVALID_NAME', `${label}须为 1–100 个字符`)
  }
  return normalized
}

export function normalizeIndex(value: unknown, max: number): number {
  if (value === undefined) return max
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > max) {
    throw new KnowledgeValidationError('INVALID_INDEX', '目标位置无效')
  }
  return Number(value)
}

function assertTipTapNode(
  value: unknown,
  path: string,
  allowUnknownTypes = false,
  validateStructure = true,
): asserts value is TipTapNode {
  assertJsonObject(value, `TipTap 节点 ${path}`)
  if (typeof value.type !== 'string' || value.type.length === 0) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `TipTap 节点 ${path} 缺少类型`)
  }
  if (!allowUnknownTypes && !TIPTAP_NODE_TYPE_SET.has(value.type)) {
    const hint = value.type === 'excalidraw'
      ? '；Excalidraw scene 不是文档节点，引用画布请使用 canvasReference 并设置 attrs.canvasId'
      : ''
    throw new KnowledgeValidationError(
      'INVALID_INPUT', `TipTap 节点 ${path} 类型不受支持: ${value.type}${hint}`,
    )
  }
  if (value.attrs !== undefined && !isPlainObject(value.attrs)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `TipTap 节点 ${path} 属性无效`)
  }
  if (value.text !== undefined && typeof value.text !== 'string') {
    throw new KnowledgeValidationError('CORRUPT_DATA', `TipTap 节点 ${path} 文本无效`)
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `TipTap 节点 ${path} 子节点无效`)
    }
    value.content.forEach((child, index) => (
      assertTipTapNode(child, `${path}.${index}`, allowUnknownTypes, validateStructure)
    ))
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `TipTap 节点 ${path} marks 无效`)
    }
    value.marks.forEach((mark, index) => {
      assertJsonObject(mark, `TipTap 节点 ${path} mark ${index}`)
      if (
        typeof mark.type !== 'string' ||
        (!allowUnknownTypes && !TIPTAP_MARK_TYPE_SET.has(mark.type))
      ) {
        throw new KnowledgeValidationError(
          'INVALID_INPUT', `TipTap 节点 ${path} mark 类型不受支持: ${String(mark.type)}`,
        )
      }
      if (mark.attrs !== undefined && !isPlainObject(mark.attrs)) {
        throw new KnowledgeValidationError('CORRUPT_DATA', `TipTap 节点 ${path} mark 属性无效`)
      }
      if (mark.type === 'underline' && mark.attrs !== undefined && Object.keys(mark.attrs).length > 0) {
        throw new KnowledgeValidationError('INVALID_INPUT', `TipTap 节点 ${path} underline 不能包含属性`)
      }
      if (mark.type === 'highlight') {
        const attrs = mark.attrs ?? {}
        const unexpected = Object.keys(attrs).find((key) => key !== 'color')
        if (unexpected) {
          throw new KnowledgeValidationError(
            'INVALID_INPUT', `TipTap 节点 ${path} highlight 包含不受支持的属性: ${unexpected}`,
          )
        }
        assertHighlightColor(attrs.color, `TipTap 节点 ${path} highlight 的 attrs.color`)
      }
    })
  }
  assertOptionalNodeId(value as TipTapNode, path)
  const referenceIdAttr = REFERENCE_ID_ATTRS[value.type as keyof typeof REFERENCE_ID_ATTRS]
  if (referenceIdAttr) {
    assertUuid(value.attrs?.[referenceIdAttr], `${value.type} 的 attrs.${referenceIdAttr}`)
    if (value.content !== undefined) {
      throw new KnowledgeValidationError('INVALID_INPUT', `${value.type} 是原子引用节点，不能包含 content`)
    }
  }
  if (validateStructure && !allowUnknownTypes) assertTipTapNodeStructure(value as TipTapNode, path)
}

export function assertTipTapNodeFragment(value: unknown): asserts value is TipTapNode {
  assertTipTapNode(value, 'fragment')
  if (value.type === 'doc') {
    throw new KnowledgeValidationError('INVALID_INPUT', 'TipTap 片段不能包含 doc 根节点')
  }
}

function assertChildrenMatch(
  node: TipTapNode,
  path: string,
  predicate: (type: string) => boolean,
  expectation: string,
): void {
  const invalidIndex = (node.content ?? []).findIndex((child) => !predicate(child.type))
  if (invalidIndex >= 0) {
    const actual = node.content![invalidIndex].type
    throw new KnowledgeValidationError(
      'INVALID_INPUT',
      `TipTap 节点 ${path} (${node.type}) ${expectation}，不能包含 ${actual}`,
    )
  }
}

function assertTipTapNodeStructure(node: TipTapNode, path: string): void {
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length === 0) {
      throw new KnowledgeValidationError('INVALID_INPUT', `TipTap 节点 ${path} (text) 必须包含非空 text`)
    }
  } else if (node.text !== undefined) {
    throw new KnowledgeValidationError(
      'INVALID_INPUT', `TipTap 节点 ${path} (${node.type}) 不能包含 text`,
    )
  }
  if (node.marks !== undefined && node.type !== 'text' && node.type !== 'hardBreak') {
    throw new KnowledgeValidationError(
      'INVALID_INPUT', `TipTap 节点 ${path} (${node.type}) 不能包含 marks`,
    )
  }
  switch (node.type) {
    case 'doc':
    case 'blockquote':
    case 'tableHeader':
    case 'tableCell':
      assertChildrenMatch(node, path, (type) => TIPTAP_BLOCK_NODE_TYPE_SET.has(type), '只能包含块节点')
      return
    case 'paragraph':
    case 'heading':
      assertChildrenMatch(node, path, (type) => TIPTAP_INLINE_NODE_TYPE_SET.has(type), '只能包含行内节点')
      return
    case 'detailsSummary':
      assertChildrenMatch(node, path, (type) => type === 'text', '只能包含文本节点')
      return
    case 'detailsContent':
      if (!node.content?.length) {
        throw new KnowledgeValidationError('INVALID_INPUT', `TipTap 节点 ${path} (detailsContent) 必须包含块节点`)
      }
      assertChildrenMatch(node, path, (type) => TIPTAP_BLOCK_NODE_TYPE_SET.has(type), '只能包含块节点')
      return
    case 'details':
      assertNodeAttributeKeys(node, path, ['nodeId'])
      if (
        node.content?.length !== 2 ||
        node.content[0]?.type !== 'detailsSummary' ||
        node.content[1]?.type !== 'detailsContent'
      ) {
        throw new KnowledgeValidationError(
          'INVALID_INPUT', `TipTap 节点 ${path} (details) 必须依次包含 detailsSummary 和 detailsContent`,
        )
      }
      return
    case 'codeBlock':
      assertChildrenMatch(node, path, (type) => type === 'text', '只能包含文本节点')
      return
    case 'bulletList':
    case 'orderedList':
      assertChildrenMatch(node, path, (type) => type === 'listItem', '只能包含 listItem')
      return
    case 'taskList':
      assertChildrenMatch(node, path, (type) => type === 'taskItem', '只能包含 taskItem')
      return
    case 'listItem':
    case 'taskItem': {
      assertChildrenMatch(node, path, (type) => TIPTAP_BLOCK_NODE_TYPE_SET.has(type), '只能包含块节点')
      const first = node.content?.[0]
      if (first && first.type !== 'paragraph') {
        throw new KnowledgeValidationError(
          'INVALID_INPUT', `TipTap 节点 ${path} (${node.type}) 的第一个子节点必须是 paragraph`,
        )
      }
      return
    }
    case 'table':
      assertChildrenMatch(node, path, (type) => type === 'tableRow', '只能包含 tableRow')
      return
    case 'tableRow':
      assertChildrenMatch(
        node,
        path,
        (type) => type === 'tableHeader' || type === 'tableCell',
        '只能包含 tableHeader 或 tableCell',
      )
      return
    case 'text':
    case 'hardBreak':
    case 'horizontalRule':
    case 'image':
      if (node.content !== undefined) {
        throw new KnowledgeValidationError(
          'INVALID_INPUT', `TipTap 节点 ${path} (${node.type}) 不能包含 content`,
        )
      }
      if (node.type === 'image') {
        const source = node.attrs?.src
        if (
          typeof source !== 'string' || source.length === 0 ||
          (!/^https:\/\//i.test(source) && !/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/]+={0,2}$/i.test(source))
        ) {
          throw new KnowledgeValidationError(
            'INVALID_INPUT', `TipTap 节点 ${path} (image) 的 attrs.src 只支持 HTTPS 或 data:image`,
          )
        }
      }
      return
    case 'documentReference':
      assertNodeAttributeKeys(node, path, ['nodeId', 'documentId', 'label'])
      if (
        node.attrs?.label !== undefined && node.attrs.label !== null &&
        (typeof node.attrs.label !== 'string' || node.attrs.label.length > 500)
      ) {
        throw new KnowledgeValidationError(
          'INVALID_INPUT', `TipTap 节点 ${path} (documentReference) 的 attrs.label 无效`,
        )
      }
      return
    case 'fileAttachment': {
      assertNodeAttributeKeys(node, path, ['nodeId', 'assetId', 'displayName'])
      const displayName = node.attrs?.displayName
      if (
        displayName !== undefined && displayName !== null &&
        (typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 255)
      ) {
        throw new KnowledgeValidationError(
          'INVALID_INPUT', `TipTap 节点 ${path} (fileAttachment) 的 attrs.displayName 无效`,
        )
      }
      return
    }
    default:
      return
  }
}

export function assertAssetManifestEntry(
  value: unknown,
  label = '附件元数据',
): asserts value is AssetManifestEntry {
  assertJsonObject(value, label)
  const allowed = new Set([
    'fileName', 'extension', 'mimeType', 'size', 'sha256', 'createdAt', 'updatedAt',
  ])
  const unexpected = Object.keys(value).find((key) => !allowed.has(key))
  if (unexpected) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label} 包含未知字段: ${unexpected}`)
  }
  assertPathSegment(value.fileName, `${label} fileName`)
  if (
    typeof value.extension !== 'string' || !/^[a-z0-9]{1,16}$/i.test(value.extension)
  ) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label} extension 无效`)
  }
  const fileExtension = String(value.fileName).match(/\.([a-z0-9]{1,16})$/i)?.[1].toLowerCase()
  if (fileExtension !== value.extension.toLowerCase()) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label} extension 与 fileName 不一致`)
  }
  assertMimeType(value.mimeType, `${label} mimeType`)
  if (!Number.isSafeInteger(value.size) || Number(value.size) < 0) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label} size 无效`)
  }
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label} sha256 无效`)
  }
  assertIsoTimestamp(value.createdAt, `${label} createdAt`)
  assertIsoTimestamp(value.updatedAt, `${label} updatedAt`)
}

export function assertAssetManifest(value: unknown): asserts value is AssetManifest {
  assertJsonObject(value, '附件清单')
  if (value.schemaVersion !== 1) {
    throw new KnowledgeValidationError('UNSUPPORTED_VERSION', '不支持的附件清单版本')
  }
  assertJsonObject(value.assets, '附件清单 assets')
  for (const [assetId, entry] of Object.entries(value.assets)) {
    assertUuid(assetId, '附件清单资源 ID')
    assertAssetManifestEntry(entry, `附件 ${assetId} 元数据`)
  }
}

export function assertTipTapDocument(
  value: unknown,
  options: { allowUnknownTypes?: boolean } = {},
): asserts value is TipTapDocument {
  assertTipTapNode(value, 'root', options.allowUnknownTypes)
  if (value.type !== 'doc') {
    throw new KnowledgeValidationError('CORRUPT_DATA', 'TipTap 根节点必须是 doc')
  }
}

/**
 * Repairs the narrow invalid shape produced by the original MCP document_insert
 * implementation: a paragraph/heading used as a wrapper around block nodes.
 * Mixed inline/block content remains invalid and is rejected instead of guessed.
 */
export function normalizeTipTapDocumentStructure(value: unknown): TipTapDocument {
  assertTipTapNode(value, 'root', false, false)
  if (value.type !== 'doc') {
    throw new KnowledgeValidationError('CORRUPT_DATA', 'TipTap 根节点必须是 doc')
  }
  const document = cloneJson(value as TipTapDocument)
  const normalizeNode = (node: TipTapNode): TipTapNode[] => {
    if (node.content) node.content = node.content.flatMap(normalizeNode)
    if (
      (node.type === 'paragraph' || node.type === 'heading') &&
      node.content?.length &&
      node.content.every((child) => TIPTAP_BLOCK_NODE_TYPE_SET.has(child.type))
    ) {
      return node.content
    }
    return [node]
  }
  document.content = (document.content ?? []).flatMap(normalizeNode)
  assertTipTapDocument(document)
  return document
}

const EXCALIDRAW_ELEMENT_TYPE_SET = new Set<string>(EXCALIDRAW_ELEMENT_TYPES)
const EXCALIDRAW_FILL_STYLES = new Set(['hachure', 'cross-hatch', 'solid', 'zigzag'])
const EXCALIDRAW_STROKE_STYLES = new Set(['solid', 'dashed', 'dotted'])
const EXCALIDRAW_TEXT_ALIGNS = new Set(['left', 'center', 'right'])
const EXCALIDRAW_VERTICAL_ALIGNS = new Set(['top', 'middle', 'bottom'])
const EXCALIDRAW_ARROWHEADS = new Set([
  'arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline',
  'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many',
])

function requireElementNumber(
  value: ExcalidrawElement,
  key: string,
  index: number,
  options: { integer?: boolean; min?: number; max?: number } = {},
): void {
  const item = value[key]
  if (
    typeof item !== 'number' || !Number.isFinite(item) ||
    (options.integer && !Number.isInteger(item)) ||
    (options.min !== undefined && item < options.min) ||
    (options.max !== undefined && item > options.max)
  ) {
    throw new KnowledgeValidationError(
      'CORRUPT_DATA', `Excalidraw 元素 ${index} 的 ${key} 无效`,
    )
  }
}

function requireElementString(value: ExcalidrawElement, key: string, index: number): void {
  if (typeof value[key] !== 'string') {
    throw new KnowledgeValidationError(
      'CORRUPT_DATA', `Excalidraw 元素 ${index} 的 ${key} 无效`,
    )
  }
}

function isPointList(value: JsonValue | undefined): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(
    (point) => Array.isArray(point) && point.length === 2 && point.every(
      (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
    ),
  )
}

export function assertExcalidrawElement(
  value: unknown,
  index = 0,
): asserts value is ExcalidrawElement {
  assertJsonObject(value, `Excalidraw 元素 ${index}`)
  assertNativeId(value.id, `Excalidraw 元素 ${index} ID`)
  if (typeof value.type !== 'string' || !EXCALIDRAW_ELEMENT_TYPE_SET.has(value.type)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 类型无效`)
  }
  const element = value as ExcalidrawElement
  for (const key of ['x', 'y', 'width', 'height', 'angle', 'strokeWidth', 'roughness', 'seed', 'versionNonce', 'updated']) {
    requireElementNumber(element, key, index)
  }
  requireElementNumber(element, 'opacity', index, { min: 0, max: 100 })
  requireElementNumber(element, 'version', index, { integer: true, min: 1 })
  for (const key of ['strokeColor', 'backgroundColor', 'fillStyle', 'strokeStyle']) {
    requireElementString(element, key, index)
  }
  if (!EXCALIDRAW_FILL_STYLES.has(String(value.fillStyle))) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} fillStyle 无效`)
  }
  if (!EXCALIDRAW_STROKE_STYLES.has(String(value.strokeStyle))) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} strokeStyle 无效`)
  }
  if (typeof value.isDeleted !== 'boolean' || typeof value.locked !== 'boolean') {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 布尔状态无效`)
  }
  if (!Array.isArray(value.groupIds) || value.groupIds.some((id) => typeof id !== 'string')) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} groupIds 无效`)
  }
  for (const key of ['frameId', 'link', 'index'] as const) {
    if (value[key] !== null && typeof value[key] !== 'string') {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 的 ${key} 无效`)
    }
  }
  if (
    value.roundness !== null &&
    (
      !isPlainObject(value.roundness) ||
      ![1, 2, 3].includes(Number(value.roundness.type)) ||
      (value.roundness.value !== undefined && (
        typeof value.roundness.value !== 'number' || !Number.isFinite(value.roundness.value)
      ))
    )
  ) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} roundness 无效`)
  }
  if (value.fileId !== undefined && value.fileId !== null && typeof value.fileId !== 'string') {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 文件引用无效`)
  }
  if (value.boundElements !== undefined && value.boundElements !== null) {
    if (!Array.isArray(value.boundElements) || value.boundElements.some(
      (binding) => !isPlainObject(binding) || typeof binding.id !== 'string' ||
        (binding.type !== 'arrow' && binding.type !== 'text'),
    )) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 绑定无效`)
    }
  }
  for (const key of ['containerId', 'frameId'] as const) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 绑定无效`)
    }
  }
  for (const key of ['startBinding', 'endBinding'] as const) {
    const binding = value[key]
    if (
      binding !== undefined && binding !== null &&
      (
        !isPlainObject(binding) || typeof binding.elementId !== 'string' ||
        typeof binding.focus !== 'number' || !Number.isFinite(binding.focus) ||
        typeof binding.gap !== 'number' || !Number.isFinite(binding.gap)
      )
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 元素 ${index} 绑定无效`)
    }
  }
  if (value.type === 'text') {
    for (const key of ['text', 'originalText', 'textAlign', 'verticalAlign']) requireElementString(element, key, index)
    requireElementNumber(element, 'fontSize', index, { min: 1 })
    requireElementNumber(element, 'fontFamily', index)
    requireElementNumber(element, 'lineHeight', index, { min: 0 })
    if (typeof value.autoResize !== 'boolean' || (value.containerId !== null && typeof value.containerId !== 'string')) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 文本元素 ${index} 结构无效`)
    }
    if (
      !EXCALIDRAW_TEXT_ALIGNS.has(String(value.textAlign)) ||
      !EXCALIDRAW_VERTICAL_ALIGNS.has(String(value.verticalAlign))
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 文本元素 ${index} 对齐方式无效`)
    }
  }
  if (value.type === 'line' || value.type === 'arrow') {
    if (!isPointList(value.points) || (value.lastCommittedPoint !== null && !isPointList([value.lastCommittedPoint] as JsonValue))) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 线性元素 ${index} points 无效`)
    }
    for (const key of ['startArrowhead', 'endArrowhead'] as const) {
      if (value[key] !== null && (
        typeof value[key] !== 'string' || !EXCALIDRAW_ARROWHEADS.has(value[key] as string)
      )) {
        throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 线性元素 ${index} 箭头属性无效`)
      }
    }
    if (
      value.type === 'arrow' && value.elbowed !== undefined &&
      typeof value.elbowed !== 'boolean'
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 箭头元素 ${index} elbowed 无效`)
    }
  }
  if (value.type === 'freedraw') {
    if (
      !isPointList(value.points) || !Array.isArray(value.pressures) ||
      value.pressures.some((pressure) => typeof pressure !== 'number' || !Number.isFinite(pressure)) ||
      typeof value.simulatePressure !== 'boolean' ||
      (value.lastCommittedPoint !== null && !isPointList([value.lastCommittedPoint] as JsonValue))
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 自由绘制元素 ${index} 结构无效`)
    }
  }
  if (value.type === 'image') {
    const crop = value.crop
    if (
      (value.fileId !== null && typeof value.fileId !== 'string') ||
      !['pending', 'saved', 'error'].includes(String(value.status)) ||
      !Array.isArray(value.scale) || value.scale.length !== 2 ||
      value.scale.some((scale) => typeof scale !== 'number' || !Number.isFinite(scale)) ||
      (crop !== null && (
        !isPlainObject(crop) ||
        ['x', 'y', 'width', 'height', 'naturalWidth', 'naturalHeight'].some(
          (key) => typeof crop[key] !== 'number' || !Number.isFinite(crop[key] as number),
        )
      ))
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 图片元素 ${index} 结构无效`)
    }
  }
  if ((value.type === 'frame' || value.type === 'magicframe') && value.name !== null && typeof value.name !== 'string') {
    throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw frame 元素 ${index} name 无效`)
  }
}

export function assertExcalidrawScene(value: unknown): asserts value is ExcalidrawScene {
  assertJsonObject(value, 'Excalidraw 场景')
  if (value.type !== 'excalidraw' || !Number.isInteger(value.version) || Number(value.version) < 1) {
    throw new KnowledgeValidationError('CORRUPT_DATA', 'Excalidraw 场景版本无效')
  }
  if (typeof value.source !== 'string') {
    throw new KnowledgeValidationError('CORRUPT_DATA', 'Excalidraw 场景来源无效')
  }
  if (!Array.isArray(value.elements)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', 'Excalidraw 元素列表无效')
  }
  value.elements.forEach((element, index) => assertExcalidrawElement(element, index))
  if (!isPlainObject(value.appState) || !isPlainObject(value.files)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', 'Excalidraw 状态或文件无效')
  }
  const scene = value as unknown as ExcalidrawScene
  for (const [fileId, file] of Object.entries(scene.files)) {
    assertNativeId(fileId, 'Excalidraw 文件 ID')
    assertJsonObject(file, `Excalidraw 文件 ${fileId}`)
    if (file.id !== fileId) {
      throw new KnowledgeValidationError('CONFLICT', `Excalidraw 文件 ID 与索引键不一致: ${fileId}`)
    }
    if (
      typeof file.mimeType !== 'string' || file.mimeType.length === 0 ||
      typeof file.dataURL !== 'string' || file.dataURL.length === 0 ||
      typeof file.created !== 'number' || !Number.isFinite(file.created) ||
      (file.lastRetrieved !== undefined && (
        typeof file.lastRetrieved !== 'number' || !Number.isFinite(file.lastRetrieved)
      )) ||
      (file.version !== undefined && (
        typeof file.version !== 'number' || !Number.isFinite(file.version)
      ))
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `Excalidraw 文件 ${fileId} 结构无效`)
    }
  }
  const ids = new Set<string>()
  for (const element of scene.elements) {
    if (ids.has(element.id)) {
      throw new KnowledgeValidationError('CONFLICT', `Excalidraw 元素 ID 重复: ${element.id}`)
    }
    ids.add(element.id)
  }
  for (const element of scene.elements) {
    if (typeof element.fileId === 'string' && !(element.fileId in scene.files)) {
      throw new KnowledgeValidationError('NOT_FOUND', `Excalidraw 文件不存在: ${element.fileId}`)
    }
    const references = [element.containerId, element.frameId]
    if (Array.isArray(element.boundElements)) {
      references.push(...element.boundElements.map((binding) => (
        isPlainObject(binding) ? binding.id : undefined
      )))
    }
    for (const key of ['startBinding', 'endBinding'] as const) {
      const binding = element[key]
      references.push(isPlainObject(binding) ? binding.elementId : undefined)
    }
    for (const reference of references) {
      if (typeof reference === 'string' && !ids.has(reference)) {
        throw new KnowledgeValidationError('NOT_FOUND', `Excalidraw 绑定元素不存在: ${reference}`)
      }
    }
  }
}

/** Validate and clone a native scene without inventing engine-owned fields. */
export function normalizeExcalidrawSceneStructure(value: unknown): ExcalidrawScene {
  assertJsonObject(value, 'Excalidraw 场景')
  const scene = cloneJson(value) as unknown as ExcalidrawScene
  assertExcalidrawScene(scene)
  return scene
}

function assertMindMapNode(value: unknown, ids: Set<string>): asserts value is MindMapNodeData {
  assertJsonObject(value, '思维导图节点')
  assertNativeId(value.id, '思维导图节点 ID')
  if (typeof value.topic !== 'string') {
    throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图节点主题无效')
  }
  if (ids.has(value.id)) {
    throw new KnowledgeValidationError('CONFLICT', `思维导图节点 ID 重复: ${value.id}`)
  }
  ids.add(value.id)
  if (value.parent !== undefined) {
    throw new KnowledgeValidationError('INVALID_INPUT', '思维导图持久化节点不能包含运行时 parent 字段')
  }
  if (value.style !== undefined) {
    if (!isPlainObject(value.style) || Object.values(value.style).some((item) => typeof item !== 'string')) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} style 无效`)
    }
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || value.tags.some((tag) => {
      if (typeof tag === 'string') return false
      if (!isPlainObject(tag) || typeof tag.text !== 'string') return true
      if (tag.className !== undefined && typeof tag.className !== 'string') return true
      return tag.style !== undefined && (
        !isPlainObject(tag.style) || Object.values(tag.style).some((item) => typeof item !== 'string')
      )
    })) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} tags 无效`)
    }
  }
  if (value.icons !== undefined && (
    !Array.isArray(value.icons) || value.icons.some((icon) => typeof icon !== 'string')
  )) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} icons 无效`)
  }
  for (const key of ['hyperLink', 'branchColor', 'dangerouslySetInnerHTML', 'note'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} 的 ${key} 无效`)
    }
  }
  if (value.expanded !== undefined && typeof value.expanded !== 'boolean') {
    throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} expanded 无效`)
  }
  if (value.direction !== undefined && value.direction !== 0 && value.direction !== 1) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} direction 无效`)
  }
  if (value.image !== undefined) {
    if (
      !isPlainObject(value.image) || typeof value.image.url !== 'string' ||
      typeof value.image.width !== 'number' || !Number.isFinite(value.image.width) ||
      typeof value.image.height !== 'number' || !Number.isFinite(value.image.height) ||
      (value.image.fit !== undefined && !['fill', 'contain', 'cover'].includes(String(value.image.fit)))
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图节点 ${value.id} image 无效`)
    }
  }
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图子节点无效')
    }
    value.children.forEach((child) => assertMindMapNode(child, ids))
  }
}

export function assertMindMapData(value: unknown): asserts value is MindMapData {
  assertJsonObject(value, '思维导图')
  const nodeIds = new Set<string>()
  assertMindMapNode(value.nodeData, nodeIds)
  if (value.direction !== undefined && ![0, 1, 2, 3].includes(Number(value.direction))) {
    throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 direction 无效')
  }
  if (value.compact !== undefined && typeof value.compact !== 'boolean') {
    throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 compact 无效')
  }
  if (value.theme !== undefined) {
    if (
      !isPlainObject(value.theme) || typeof value.theme.name !== 'string' ||
      !Array.isArray(value.theme.palette) || value.theme.palette.some((color) => typeof color !== 'string') ||
      (value.theme.type !== undefined && value.theme.type !== 'light' && value.theme.type !== 'dark') ||
      (value.theme.cssVar !== undefined && (
        !isPlainObject(value.theme.cssVar) ||
        Object.values(value.theme.cssVar).some((item) => typeof item !== 'string')
      ))
    ) {
      throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 theme 无效')
    }
  }
  if (value.meta !== undefined && !isPlainObject(value.meta)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 meta 无效')
  }
  const relationIds = new Set<string>()
  if (value.arrows !== undefined) {
    if (!Array.isArray(value.arrows)) throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 arrows 无效')
    for (const arrow of value.arrows) {
      if (!isPlainObject(arrow)) throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 arrow 无效')
      assertNativeId(arrow.id, '思维导图 arrow ID')
      if (relationIds.has(arrow.id)) throw new KnowledgeValidationError('CONFLICT', `思维导图关系 ID 重复: ${arrow.id}`)
      relationIds.add(arrow.id)
      if (
        typeof arrow.label !== 'string' || typeof arrow.from !== 'string' || typeof arrow.to !== 'string' ||
        !nodeIds.has(arrow.from) || !nodeIds.has(arrow.to) ||
        (arrow.bidirectional !== undefined && typeof arrow.bidirectional !== 'boolean')
      ) {
        throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 arrow ${arrow.id} 结构无效`)
      }
      for (const key of ['delta1', 'delta2'] as const) {
        const delta = arrow[key]
        if (delta !== undefined && (
          !isPlainObject(delta) || typeof delta.x !== 'number' || !Number.isFinite(delta.x) ||
          typeof delta.y !== 'number' || !Number.isFinite(delta.y)
        )) {
          throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 arrow ${arrow.id} 的 ${key} 无效`)
        }
      }
      if (arrow.style !== undefined) {
        if (!isPlainObject(arrow.style)) {
          throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 arrow ${arrow.id} style 无效`)
        }
        for (const key of ['stroke', 'strokeDasharray', 'labelColor'] as const) {
          if (arrow.style[key] !== undefined && typeof arrow.style[key] !== 'string') {
            throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 arrow ${arrow.id} style.${key} 无效`)
          }
        }
        for (const key of ['strokeWidth', 'opacity'] as const) {
          if (arrow.style[key] !== undefined && !['string', 'number'].includes(typeof arrow.style[key])) {
            throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 arrow ${arrow.id} style.${key} 无效`)
          }
        }
        if (
          arrow.style.strokeLinecap !== undefined &&
          !['butt', 'round', 'square'].includes(String(arrow.style.strokeLinecap))
        ) {
          throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 arrow ${arrow.id} style.strokeLinecap 无效`)
        }
      }
    }
  }
  if (value.summaries !== undefined) {
    if (!Array.isArray(value.summaries)) throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 summaries 无效')
    for (const summary of value.summaries) {
      if (!isPlainObject(summary)) throw new KnowledgeValidationError('CORRUPT_DATA', '思维导图 summary 无效')
      assertNativeId(summary.id, '思维导图 summary ID')
      if (relationIds.has(summary.id)) throw new KnowledgeValidationError('CONFLICT', `思维导图关系 ID 重复: ${summary.id}`)
      relationIds.add(summary.id)
      const summaryStyle = summary.style
      if (
        typeof summary.label !== 'string' || typeof summary.parent !== 'string' ||
        !nodeIds.has(summary.parent) || !Number.isInteger(summary.start) ||
        !Number.isInteger(summary.end) || Number(summary.start) < 0 ||
        Number(summary.end) < Number(summary.start) ||
        (summaryStyle !== undefined && (
          !isPlainObject(summaryStyle) ||
          ['stroke', 'labelColor'].some((key) => (
            summaryStyle[key] !== undefined && typeof summaryStyle[key] !== 'string'
          ))
        ))
      ) {
        throw new KnowledgeValidationError('CORRUPT_DATA', `思维导图 summary ${summary.id} 结构无效`)
      }
    }
  }
}

export function cloneJson<T extends JsonValue>(value: T): T {
  if (!isJsonValue(value)) {
    throw new KnowledgeValidationError('INVALID_INPUT', '值不是有效 JSON')
  }
  return structuredClone(value)
}
