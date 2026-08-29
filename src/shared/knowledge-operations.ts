import { v4 as uuidv4 } from 'uuid'
import { TIPTAP_REFERENCE_NODE_TYPES } from './knowledge-types'
import type {
  CanvasElementPatch,
  CanvasElementSnapshot,
  CanvasPlacement,
  CanvasSearchResult,
  CanvasUpdate,
  DocumentNodeSnapshot,
  DocumentNodeUpdate,
  DocumentSearchResult,
  DocumentNodePatch,
  DocumentReference,
  InternalDocumentReference,
  FileAttachmentReference,
  ExcalidrawElement,
  ExcalidrawScene,
  JsonObject,
  JsonValue,
  MindMapData,
  MindMapNodeMove,
  MindMapNodeData,
  MindMapNodePatch,
  MindMapNodeSnapshot,
  MindMapNodeUpdate,
  MindMapSearchResult,
  TipTapDocument,
  TipTapNode,
} from './knowledge-types'
import {
  assertExcalidrawScene,
  assertJsonObject,
  assertMindMapData,
  assertNativeId,
  assertTipTapDocument,
  assertUuid,
  cloneJson,
  KnowledgeValidationError,
  normalizeIndex,
} from './knowledge-validation'

function nodeId(node: TipTapNode): string | undefined {
  return typeof node.attrs?.nodeId === 'string' ? node.attrs.nodeId : undefined
}

function visitNodes(node: TipTapNode, visitor: (node: TipTapNode) => void): void {
  visitor(node)
  node.content?.forEach((child) => visitNodes(child, visitor))
}

function assignNodeIds(
  nodes: TipTapNode[],
  used: Set<string>,
  createId: () => string,
): void {
  for (const node of nodes) {
    if (node.type !== 'text' && node.type !== 'doc') {
      const existing = nodeId(node)
      if (existing !== undefined) {
        assertUuid(existing, '节点 ID')
        if (used.has(existing)) {
          throw new KnowledgeValidationError('CONFLICT', `节点 ID 重复: ${existing}`)
        }
        used.add(existing)
      } else {
        let created = createId()
        while (used.has(created)) created = createId()
        assertUuid(created, '新节点 ID')
        node.attrs = { ...(node.attrs ?? {}), nodeId: created }
        used.add(created)
      }
    }
    if (node.content) assignNodeIds(node.content, used, createId)
  }
}

export function normalizeDocumentNodeIds(
  value: TipTapDocument,
  createId: () => string = uuidv4,
): TipTapDocument {
  assertTipTapDocument(value)
  const document = cloneJson(value)
  assignNodeIds(document.content ?? [], new Set(), createId)
  return document
}

export function collectDocumentReferences(document: TipTapDocument): DocumentReference[] {
  assertTipTapDocument(document)
  const references: DocumentReference[] = []
  visitNodes(document, (node) => {
    const id = nodeId(node)
    if (!id) return
    if (node.type === TIPTAP_REFERENCE_NODE_TYPES.canvas && typeof node.attrs?.canvasId === 'string') {
      references.push({ type: 'canvas', id: node.attrs.canvasId, nodeId: id })
    } else if (node.type === TIPTAP_REFERENCE_NODE_TYPES.mindmap && typeof node.attrs?.mindmapId === 'string') {
      references.push({ type: 'mindmap', id: node.attrs.mindmapId, nodeId: id })
    } else if (node.type === TIPTAP_REFERENCE_NODE_TYPES.asset && typeof node.attrs?.assetId === 'string') {
      references.push({ type: 'asset', id: node.attrs.assetId, nodeId: id })
    } else if (node.type === TIPTAP_REFERENCE_NODE_TYPES.attachment && typeof node.attrs?.assetId === 'string') {
      references.push({ type: 'asset', id: node.attrs.assetId, nodeId: id })
    }
  })
  return references
}

export function collectInternalDocumentReferences(
  document: TipTapDocument,
): InternalDocumentReference[] {
  assertTipTapDocument(document)
  const references: InternalDocumentReference[] = []
  visitNodes(document, (node) => {
    const id = nodeId(node)
    if (
      !id || node.type !== TIPTAP_REFERENCE_NODE_TYPES.document ||
      typeof node.attrs?.documentId !== 'string'
    ) return
    references.push({
      documentId: node.attrs.documentId,
      nodeId: id,
      ...(typeof node.attrs.label === 'string' ? { label: node.attrs.label } : {}),
    })
  })
  return references
}

export function collectFileAttachmentReferences(
  document: TipTapDocument,
): FileAttachmentReference[] {
  assertTipTapDocument(document)
  const references: FileAttachmentReference[] = []
  visitNodes(document, (node) => {
    const id = nodeId(node)
    if (
      !id || node.type !== TIPTAP_REFERENCE_NODE_TYPES.attachment ||
      typeof node.attrs?.assetId !== 'string' ||
      typeof node.attrs.fileName !== 'string' ||
      typeof node.attrs.mimeType !== 'string' ||
      typeof node.attrs.size !== 'number'
    ) return
    references.push({
      assetId: node.attrs.assetId,
      nodeId: id,
      fileName: node.attrs.fileName,
      mimeType: node.attrs.mimeType,
      size: node.attrs.size,
    })
  })
  return references
}

interface LocatedNode {
  node: TipTapNode
  parent: TipTapNode | null
  index: number
  path?: number[]
}

function locateNode(root: TipTapNode, targetId: string): LocatedNode | null {
  for (let index = 0; index < (root.content?.length ?? 0); index += 1) {
    const child = root.content![index]
    if (nodeId(child) === targetId) return { node: child, parent: root, index }
    const nested = locateNode(child, targetId)
    if (nested) return nested
  }
  return null
}

function requireNode(document: TipTapDocument, targetId: string): LocatedNode {
  assertUuid(targetId, '节点 ID')
  const located = locateNode(document, targetId)
  if (!located) throw new KnowledgeValidationError('NOT_FOUND', '文档节点不存在')
  return located
}

function collectNodeSnapshots(
  documentId: string,
  root: TipTapNode,
  parentNodeId: string | null = null,
  path: number[] = [],
  result: DocumentNodeSnapshot[] = [],
): DocumentNodeSnapshot[] {
  ;(root.content ?? []).forEach((child, index) => {
    const id = nodeId(child)
    const childPath = [...path, index]
    if (id) {
      result.push({ documentId, nodeId: id, parentNodeId, index, path: childPath, node: cloneJson(child) })
    }
    collectNodeSnapshots(documentId, child, id ?? parentNodeId, childPath, result)
  })
  return result
}

export function documentNodeSnapshots(
  documentId: string,
  document: TipTapDocument,
  targetIds?: string[],
): DocumentNodeSnapshot[] {
  const snapshots = collectNodeSnapshots(documentId, normalizeDocumentNodeIds(document))
  if (!targetIds) return snapshots
  const requested = new Set(targetIds)
  targetIds.forEach((id) => assertUuid(id, '节点 ID'))
  const selected = snapshots.filter((snapshot) => requested.delete(snapshot.nodeId))
  if (requested.size) {
    throw new KnowledgeValidationError('NOT_FOUND', '部分文档节点不存在', [...requested])
  }
  return selected
}

function projectedText(node: TipTapNode): string {
  return node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(projectedText).join('')
}

export function searchDocumentNodeSnapshots(
  documentId: string,
  document: TipTapDocument,
  query: string,
  options: { nodeTypes?: string[]; caseSensitive?: boolean; limit?: number } = {},
): DocumentSearchResult {
  const needle = query.trim()
  if (!needle) throw new KnowledgeValidationError('INVALID_INPUT', '搜索内容不能为空')
  const limit = options.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new KnowledgeValidationError('INVALID_INDEX', '搜索结果数量无效')
  }
  const typeFilter = options.nodeTypes ? new Set(options.nodeTypes) : undefined
  const normalizedNeedle = options.caseSensitive ? needle : needle.toLocaleLowerCase()
  const hits = [] as DocumentSearchResult['hits']
  let totalMatchCount = 0
  let matchedNodeCount = 0
  for (const snapshot of documentNodeSnapshots(documentId, document)) {
    if (typeFilter && !typeFilter.has(snapshot.node.type)) continue
    const text = projectedText(snapshot.node)
    const haystack = options.caseSensitive ? text : text.toLocaleLowerCase()
    const matches: Array<{ from: number; to: number; text: string }> = []
    let from = 0
    while (from <= haystack.length - normalizedNeedle.length) {
      const at = haystack.indexOf(normalizedNeedle, from)
      if (at < 0) break
      matches.push({ from: at, to: at + needle.length, text: text.slice(at, at + needle.length) })
      from = at + Math.max(1, normalizedNeedle.length)
    }
    if (!matches.length) continue
    matchedNodeCount += 1
    totalMatchCount += matches.length
    if (hits.length < limit) hits.push({ ...snapshot, matchCount: matches.length, matches })
  }
  return { hits, totalMatchCount, matchedNodeCount, truncated: matchedNodeCount > hits.length }
}

export function updateDocumentNodes(
  value: TipTapDocument,
  updates: DocumentNodeUpdate[],
): TipTapDocument {
  if (!updates.length) throw new KnowledgeValidationError('INVALID_INPUT', '文档节点更新不能为空')
  const document = normalizeDocumentNodeIds(value)
  const seen = new Set<string>()
  for (const update of updates) {
    if (seen.has(update.nodeId)) throw new KnowledgeValidationError('CONFLICT', '同一节点不能重复更新')
    seen.add(update.nodeId)
    const target = requireNode(document, update.nodeId).node
    if (update.type !== undefined) {
      if (!update.type || update.type === 'doc' || update.type === 'text') {
        throw new KnowledgeValidationError('INVALID_INPUT', '文档节点类型无效')
      }
      target.type = update.type
    }
    if (update.attrs) {
      const attrs = { ...(target.attrs ?? {}) }
      for (const [key, item] of Object.entries(update.attrs.set ?? {})) {
        if (key === 'nodeId' && item !== update.nodeId) {
          throw new KnowledgeValidationError('CONFLICT', '不能修改节点 ID')
        }
        attrs[key] = item
      }
      for (const key of update.attrs.unset ?? []) {
        if (key === 'nodeId') throw new KnowledgeValidationError('CONFLICT', '不能删除节点 ID')
        delete attrs[key]
      }
      target.attrs = attrs
    }
    if ('content' in update) {
      if (update.content === null) delete target.content
      else target.content = cloneJson(update.content ?? [])
    }
  }
  return normalizeDocumentNodeIds(document)
}

function currentNodeIds(document: TipTapDocument): Set<string> {
  const ids = new Set<string>()
  visitNodes(document, (node) => {
    const id = nodeId(node)
    if (id) ids.add(id)
  })
  return ids
}

function normalizedFragments(
  fragments: TipTapNode[],
  used: Set<string>,
  createId: () => string,
): TipTapNode[] {
  if (!Array.isArray(fragments) || fragments.length === 0) {
    throw new KnowledgeValidationError('INVALID_INPUT', '待插入节点不能为空')
  }
  const cloned = cloneJson(fragments)
  cloned.forEach((node, index) => {
    assertJsonObject(node, `待插入节点 ${index}`)
    if (typeof node.type !== 'string') {
      throw new KnowledgeValidationError('INVALID_INPUT', `待插入节点 ${index} 类型无效`)
    }
  })
  assignNodeIds(cloned, used, createId)
  return cloned
}

export function insertDocumentNodes(
  value: TipTapDocument,
  parentNodeId: string | null,
  index: number | undefined,
  fragments: TipTapNode[],
  createId: () => string = uuidv4,
): TipTapDocument {
  const document = normalizeDocumentNodeIds(value, createId)
  const parent = parentNodeId === null ? document : requireNode(document, parentNodeId).node
  const children = parent.content ?? []
  const targetIndex = normalizeIndex(index, children.length)
  const inserted = normalizedFragments(fragments, currentNodeIds(document), createId)
  parent.content = [...children.slice(0, targetIndex), ...inserted, ...children.slice(targetIndex)]
  assertTipTapDocument(document)
  return document
}

export function appendDocumentNodes(
  value: TipTapDocument,
  parentNodeId: string | null,
  fragments: TipTapNode[],
  createId: () => string = uuidv4,
): TipTapDocument {
  const parent = parentNodeId === null ? value : requireNode(value, parentNodeId).node
  return insertDocumentNodes(value, parentNodeId, parent.content?.length ?? 0, fragments, createId)
}

export function replaceDocumentNode(
  value: TipTapDocument,
  targetId: string,
  replacement: TipTapNode,
  createId: () => string = uuidv4,
): TipTapDocument {
  const document = normalizeDocumentNodeIds(value, createId)
  const located = requireNode(document, targetId)
  const cloned = cloneJson(replacement)
  assertJsonObject(cloned, '替换节点')
  if (typeof cloned.type !== 'string' || cloned.type === 'doc') {
    throw new KnowledgeValidationError('INVALID_INPUT', '替换节点类型无效')
  }
  cloned.attrs = { ...(cloned.attrs ?? {}), nodeId: targetId }
  const used = currentNodeIds(document)
  used.delete(targetId)
  assignNodeIds([cloned], used, createId)
  located.parent!.content![located.index] = cloned
  assertTipTapDocument(document)
  return document
}

export function patchDocumentNode(
  value: TipTapDocument,
  targetId: string,
  patch: DocumentNodePatch,
): TipTapDocument {
  const document = normalizeDocumentNodeIds(value)
  const target = requireNode(document, targetId).node
  const attrs: JsonObject = { ...(target.attrs ?? {}) }
  for (const [key, item] of Object.entries(patch.attrs ?? {})) {
    if (key === 'nodeId' && item !== targetId) {
      throw new KnowledgeValidationError('CONFLICT', '不能修改节点 ID')
    }
    attrs[key] = item
  }
  for (const key of patch.unsetAttrs ?? []) {
    if (key === 'nodeId') throw new KnowledgeValidationError('CONFLICT', '不能删除节点 ID')
    delete attrs[key]
  }
  target.attrs = attrs
  assertTipTapDocument(document)
  return document
}

export function deleteDocumentNodes(
  value: TipTapDocument,
  targetIds: string[],
): TipTapDocument {
  const document = normalizeDocumentNodeIds(value)
  const snapshots = documentNodeSnapshots('', document)
  const paths = new Map(snapshots.map((snapshot) => [snapshot.nodeId, snapshot.path]))
  for (const id of targetIds) {
    const path = paths.get(id)
    if (!path) continue
    for (const other of targetIds) {
      if (id === other) continue
      const otherPath = paths.get(other)
      if (otherPath && otherPath.length > path.length && path.every((item, index) => otherPath[index] === item)) {
        throw new KnowledgeValidationError('INVALID_INPUT', '删除范围不能同时包含祖先和后代节点')
      }
    }
  }
  const remaining = new Set(targetIds)
  targetIds.forEach((id) => assertUuid(id, '节点 ID'))
  const remove = (node: TipTapNode): void => {
    if (!node.content) return
    node.content = node.content.filter((child) => {
      const id = nodeId(child)
      if (id && remaining.has(id)) {
        remaining.delete(id)
        return false
      }
      remove(child)
      return true
    })
  }
  remove(document)
  if (remaining.size > 0) {
    throw new KnowledgeValidationError('NOT_FOUND', '部分文档节点不存在', [...remaining])
  }
  assertTipTapDocument(document)
  return document
}

function textLength(node: TipTapNode): number {
  if (node.type === 'text') return node.text?.length ?? 0
  return node.content?.reduce((sum, child) => sum + textLength(child), 0) ?? 0
}

export function replaceDocumentText(
  value: TipTapDocument,
  blockNodeId: string,
  from: number,
  to: number,
  replacement: string,
): TipTapDocument {
  const document = normalizeDocumentNodeIds(value)
  const block = requireNode(document, blockNodeId).node
  const total = textLength(block)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > total) {
    throw new KnowledgeValidationError('INVALID_INDEX', '文本范围无效')
  }

  let offset = 0
  let inserted = false
  const transform = (node: TipTapNode): TipTapNode | null => {
    if (node.type === 'text') {
      const text = node.text ?? ''
      const start = offset
      const end = start + text.length
      offset = end
      const touches = from === to
        ? from >= start && from <= end && !inserted
        : end > from && start < to
      if (!touches) return node
      const left = text.slice(0, Math.max(0, Math.min(text.length, from - start)))
      const right = text.slice(Math.max(0, Math.min(text.length, to - start)))
      const nextText = left + (inserted ? '' : replacement) + right
      inserted = true
      return nextText.length > 0 ? { ...node, text: nextText } : null
    }
    if (node.content) {
      node.content = node.content.flatMap((child) => {
        const next = transform(child)
        return next ? [next] : []
      })
    }
    return node
  }
  transform(block)
  if (!inserted) {
    if (from !== 0) throw new KnowledgeValidationError('INVALID_INDEX', '文本插入位置无效')
    block.content = [{ type: 'text', text: replacement }, ...(block.content ?? [])]
  }
  assertTipTapDocument(document)
  return document
}

function cloneScene(value: ExcalidrawScene): ExcalidrawScene {
  assertExcalidrawScene(value)
  return cloneJson(value)
}

export function replaceCanvasScene(value: ExcalidrawScene): ExcalidrawScene {
  return cloneScene(value)
}

function validateElement(value: ExcalidrawElement): void {
  assertJsonObject(value, 'Excalidraw 元素')
  assertNativeId(value.id, 'Excalidraw 元素 ID')
  if (typeof value.type !== 'string') {
    throw new KnowledgeValidationError('INVALID_INPUT', 'Excalidraw 元素类型无效')
  }
}

export function upsertCanvasElements(
  value: ExcalidrawScene,
  elements: ExcalidrawElement[],
): ExcalidrawScene {
  const scene = cloneScene(value)
  const byId = new Map(scene.elements.map((element, index) => [element.id, index]))
  for (const input of cloneJson(elements)) {
    validateElement(input)
    const index = byId.get(input.id)
    if (index === undefined) {
      byId.set(input.id, scene.elements.length)
      scene.elements.push(input)
    } else {
      scene.elements[index] = input
    }
  }
  assertExcalidrawScene(scene)
  return scene
}

export function patchCanvasElements(
  value: ExcalidrawScene,
  patches: CanvasElementPatch[],
): ExcalidrawScene {
  const scene = cloneScene(value)
  const byId = new Map(scene.elements.map((element) => [element.id, element]))
  for (const patch of patches) {
    assertNativeId(patch.id, 'Excalidraw 元素 ID')
    const element = byId.get(patch.id)
    if (!element) throw new KnowledgeValidationError('NOT_FOUND', `画布元素不存在: ${patch.id}`)
    if (patch.changes.id !== undefined && patch.changes.id !== patch.id) {
      throw new KnowledgeValidationError('CONFLICT', '不能修改画布元素 ID')
    }
    Object.assign(element, cloneJson(patch.changes), { id: patch.id })
  }
  assertExcalidrawScene(scene)
  return scene
}

function clearDeletedBindings(element: ExcalidrawElement, deleted: Set<string>): void {
  if (Array.isArray(element.boundElements)) {
    element.boundElements = element.boundElements.filter(
      (binding) => !(
        binding !== null &&
        typeof binding === 'object' &&
        'id' in binding &&
        typeof binding.id === 'string' &&
        deleted.has(binding.id)
      ),
    ) as JsonValue[]
  }
  for (const key of ['containerId', 'frameId'] as const) {
    if (typeof element[key] === 'string' && deleted.has(element[key])) element[key] = null
  }
  for (const key of ['startBinding', 'endBinding'] as const) {
    const binding = element[key]
    if (
      binding !== null &&
      typeof binding === 'object' &&
      !Array.isArray(binding) &&
      typeof binding.elementId === 'string' &&
      deleted.has(binding.elementId)
    ) {
      element[key] = null
    }
  }
}

export function deleteCanvasElements(
  value: ExcalidrawScene,
  elementIds: string[],
): ExcalidrawScene {
  const scene = cloneScene(value)
  const deleted = new Set(elementIds)
  elementIds.forEach((id) => assertNativeId(id, 'Excalidraw 元素 ID'))
  const existing = new Set(scene.elements.map((element) => element.id))
  for (const id of deleted) {
    if (!existing.has(id)) throw new KnowledgeValidationError('NOT_FOUND', `画布元素不存在: ${id}`)
  }
  scene.elements = scene.elements.filter((element) => !deleted.has(element.id))
  scene.elements.forEach((element) => clearDeletedBindings(element, deleted))
  assertExcalidrawScene(scene)
  return scene
}

export function reorderCanvasElements(
  value: ExcalidrawScene,
  orderedIds: string[],
): ExcalidrawScene {
  const scene = cloneScene(value)
  if (orderedIds.length !== scene.elements.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new KnowledgeValidationError('INVALID_INPUT', '画布层级顺序必须包含全部且不重复的元素 ID')
  }
  const byId = new Map(scene.elements.map((element) => [element.id, element]))
  scene.elements = orderedIds.map((id) => {
    const element = byId.get(id)
    if (!element) throw new KnowledgeValidationError('NOT_FOUND', `画布元素不存在: ${id}`)
    return element
  })
  assertExcalidrawScene(scene)
  return scene
}

export function upsertCanvasFiles(
  value: ExcalidrawScene,
  files: Record<string, JsonObject>,
): ExcalidrawScene {
  const scene = cloneScene(value)
  for (const [id, file] of Object.entries(files)) {
    assertNativeId(id, 'Excalidraw 文件 ID')
    assertJsonObject(file, `Excalidraw 文件 ${id}`)
    scene.files[id] = cloneJson(file)
  }
  assertExcalidrawScene(scene)
  return scene
}

export function deleteCanvasFiles(
  value: ExcalidrawScene,
  fileIds: string[],
): ExcalidrawScene {
  const scene = cloneScene(value)
  const referenced = new Set(
    scene.elements.flatMap((element) => typeof element.fileId === 'string' ? [element.fileId] : []),
  )
  for (const id of fileIds) {
    assertNativeId(id, 'Excalidraw 文件 ID')
    if (!(id in scene.files)) throw new KnowledgeValidationError('NOT_FOUND', `画布文件不存在: ${id}`)
    if (referenced.has(id)) throw new KnowledgeValidationError('CONFLICT', `画布文件仍被元素引用: ${id}`)
    delete scene.files[id]
  }
  assertExcalidrawScene(scene)
  return scene
}

export function canvasElementSnapshots(
  scene: ExcalidrawScene,
  elementIds?: string[],
): CanvasElementSnapshot[] {
  const cloned = cloneScene(scene)
  const requested = elementIds ? new Set(elementIds) : undefined
  elementIds?.forEach((id) => assertNativeId(id, 'Excalidraw 元素 ID'))
  const result = cloned.elements.flatMap((element, zIndex) => (
    !requested || requested.delete(element.id) ? [{ element, zIndex }] : []
  ))
  if (requested?.size) throw new KnowledgeValidationError('NOT_FOUND', '部分画布元素不存在', [...requested])
  return result
}

export function searchCanvasElements(
  scene: ExcalidrawScene,
  query: string,
  options: {
    elementTypes?: string[]
    frameId?: string
    groupId?: string
    caseSensitive?: boolean
    limit?: number
  } = {},
): CanvasSearchResult {
  const needle = query.trim()
  if (!needle) throw new KnowledgeValidationError('INVALID_INPUT', '搜索内容不能为空')
  const limit = options.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new KnowledgeValidationError('INVALID_INDEX', '搜索结果数量无效')
  const types = options.elementTypes ? new Set(options.elementTypes) : undefined
  const normalized = options.caseSensitive ? needle : needle.toLocaleLowerCase()
  const hits: CanvasSearchResult['hits'] = []
  let totalMatchCount = 0
  let matchedElementCount = 0
  for (const snapshot of canvasElementSnapshots(scene)) {
    const element = snapshot.element
    if (types && !types.has(element.type)) continue
    if (options.frameId !== undefined && element.frameId !== options.frameId) continue
    if (options.groupId !== undefined && !(Array.isArray(element.groupIds) && element.groupIds.includes(options.groupId))) continue
    const values = [...new Set(
      [element.text, element.originalText, element.link, element.label]
        .filter((item): item is string => typeof item === 'string'),
    )]
    const matchCount = values.reduce((count, value) => {
      const haystack = options.caseSensitive ? value : value.toLocaleLowerCase()
      let from = 0
      let found = 0
      while (from <= haystack.length - normalized.length) {
        const at = haystack.indexOf(normalized, from)
        if (at < 0) break
        found += 1
        from = at + Math.max(1, normalized.length)
      }
      return count + found
    }, 0)
    if (!matchCount) continue
    matchedElementCount += 1
    totalMatchCount += matchCount
    if (hits.length < limit) hits.push({ ...snapshot, matchCount })
  }
  return { hits, totalMatchCount, matchedElementCount, truncated: matchedElementCount > hits.length }
}

export function insertCanvasElements(
  value: ExcalidrawScene,
  elements: ExcalidrawElement[],
  files: Record<string, JsonObject> | undefined,
  placement: CanvasPlacement,
): ExcalidrawScene {
  const scene = cloneScene(value)
  if (!elements.length) throw new KnowledgeValidationError('INVALID_INPUT', '待插入画布元素不能为空')
  const existing = new Set(scene.elements.map((element) => element.id))
  const incoming = cloneJson(elements)
  for (const element of incoming) {
    validateElement(element)
    if (existing.has(element.id)) throw new KnowledgeValidationError('CONFLICT', `画布元素 ID 重复: ${element.id}`)
    existing.add(element.id)
  }
  if (files) scene.files = upsertCanvasFiles(scene, files).files
  let index = 0
  if ('position' in placement) index = placement.position === 'front' ? scene.elements.length : 0
  else {
    const anchorId = 'beforeElementId' in placement ? placement.beforeElementId : placement.afterElementId
    const anchor = scene.elements.findIndex((element) => element.id === anchorId)
    if (anchor < 0) throw new KnowledgeValidationError('NOT_FOUND', '画布层级锚点不存在')
    index = anchor + ('afterElementId' in placement ? 1 : 0)
  }
  scene.elements.splice(index, 0, ...incoming)
  assertExcalidrawScene(scene)
  return scene
}

function applySetUnset(target: JsonObject, patch: { set?: JsonObject; unset?: string[] }, protectedKeys: string[] = []): void {
  for (const key of [...Object.keys(patch.set ?? {}), ...(patch.unset ?? [])]) {
    if (protectedKeys.includes(key)) throw new KnowledgeValidationError('CONFLICT', `不能修改字段: ${key}`)
  }
  Object.assign(target, cloneJson(patch.set ?? {}))
  for (const key of patch.unset ?? []) delete target[key]
}

export function updateCanvasScene(value: ExcalidrawScene, update: CanvasUpdate): ExcalidrawScene {
  const scene = cloneScene(value)
  const byId = new Map(scene.elements.map((element) => [element.id, element]))
  for (const patch of update.elementUpdates ?? []) {
    const element = byId.get(patch.elementId)
    if (!element) throw new KnowledgeValidationError('NOT_FOUND', `画布元素不存在: ${patch.elementId}`)
    applySetUnset(element, { set: patch.set, unset: patch.unset }, ['id'])
    element.id = patch.elementId
    element.version = (typeof element.version === 'number' ? element.version : 0) + 1
    element.versionNonce = Math.floor(Math.random() * 0x7fffffff)
    element.updated = Date.now()
  }
  if (update.elementOrder) scene.elements = reorderCanvasElements(scene, update.elementOrder).elements
  if (update.appState) applySetUnset(scene.appState, update.appState)
  if (update.files?.set) scene.files = upsertCanvasFiles(scene, update.files.set).files
  if (update.files?.delete) scene.files = deleteCanvasFiles(scene, update.files.delete).files
  assertExcalidrawScene(scene)
  return scene
}

export function deleteCanvasElementsStrict(
  value: ExcalidrawScene,
  elementIds: string[],
  removeUnreferencedFiles = false,
): ExcalidrawScene {
  const scene = cloneScene(value)
  const deleted = new Set(elementIds)
  if (!deleted.size) throw new KnowledgeValidationError('INVALID_INPUT', '待删除画布元素不能为空')
  const existing = new Set(scene.elements.map((element) => element.id))
  for (const id of deleted) if (!existing.has(id)) throw new KnowledgeValidationError('NOT_FOUND', `画布元素不存在: ${id}`)
  scene.elements = scene.elements.filter((element) => !deleted.has(element.id))
  assertExcalidrawScene(scene)
  if (removeUnreferencedFiles) {
    const referenced = new Set(scene.elements.flatMap((element) => typeof element.fileId === 'string' ? [element.fileId] : []))
    for (const id of Object.keys(scene.files)) if (!referenced.has(id)) delete scene.files[id]
  }
  assertExcalidrawScene(scene)
  return scene
}

function cloneMindMap(value: MindMapData): MindMapData {
  assertMindMapData(value)
  return cloneJson(value)
}

export function replaceMindMapData(value: MindMapData): MindMapData {
  return cloneMindMap(value)
}

interface LocatedMindNode {
  node: MindMapNodeData
  parent: MindMapNodeData | null
  index: number
}

function locateMindNode(
  node: MindMapNodeData,
  id: string,
  parent: MindMapNodeData | null = null,
  index = -1,
): LocatedMindNode | null {
  if (node.id === id) return { node, parent, index }
  for (let childIndex = 0; childIndex < (node.children?.length ?? 0); childIndex += 1) {
    const found = locateMindNode(node.children![childIndex], id, node, childIndex)
    if (found) return found
  }
  return null
}

function requireMindNode(data: MindMapData, id: string): LocatedMindNode {
  assertNativeId(id, '思维导图节点 ID')
  const located = locateMindNode(data.nodeData, id)
  if (!located) throw new KnowledgeValidationError('NOT_FOUND', `思维导图节点不存在: ${id}`)
  return located
}

export function insertMindMapNode(
  value: MindMapData,
  parentId: string,
  index: number | undefined,
  input: MindMapNodeData,
): MindMapData {
  const data = cloneMindMap(value)
  const parent = requireMindNode(data, parentId).node
  const node = cloneJson(input)
  const children = parent.children ?? []
  const targetIndex = normalizeIndex(index, children.length)
  parent.children = [...children.slice(0, targetIndex), node, ...children.slice(targetIndex)]
  assertMindMapData(data)
  return data
}

export function patchMindMapNode(value: MindMapData, patch: MindMapNodePatch): MindMapData {
  const data = cloneMindMap(value)
  const target = requireMindNode(data, patch.id).node
  if (patch.changes.id !== undefined && patch.changes.id !== patch.id) {
    throw new KnowledgeValidationError('CONFLICT', '不能修改思维导图节点 ID')
  }
  if (patch.changes.children !== undefined) {
    throw new KnowledgeValidationError('CONFLICT', '请使用明确的思维导图节点增删移动操作')
  }
  Object.assign(target, cloneJson(patch.changes), { id: patch.id })
  assertMindMapData(data)
  return data
}

export function moveMindMapNode(
  value: MindMapData,
  nodeIdToMove: string,
  targetParentId: string,
  index: number | undefined,
): MindMapData {
  const data = cloneMindMap(value)
  const located = requireMindNode(data, nodeIdToMove)
  if (!located.parent) throw new KnowledgeValidationError('CONFLICT', '不能移动思维导图根节点')
  if (locateMindNode(located.node, targetParentId)) {
    throw new KnowledgeValidationError('CONFLICT', '思维导图节点不能移动到自身或后代')
  }
  const targetParent = requireMindNode(data, targetParentId).node
  located.parent.children!.splice(located.index, 1)
  const children = targetParent.children ?? []
  const targetIndex = normalizeIndex(index, children.length)
  targetParent.children = [...children.slice(0, targetIndex), located.node, ...children.slice(targetIndex)]
  assertMindMapData(data)
  return data
}

export function deleteMindMapNode(value: MindMapData, targetId: string): MindMapData {
  const data = cloneMindMap(value)
  const located = requireMindNode(data, targetId)
  if (!located.parent) throw new KnowledgeValidationError('CONFLICT', '不能删除思维导图根节点')
  located.parent.children!.splice(located.index, 1)
  assertMindMapData(data)
  return data
}

function collectMindSnapshots(
  node: MindMapNodeData,
  parentNodeId: string | null = null,
  index = -1,
  path: string[] = [],
  result: MindMapNodeSnapshot[] = [],
): MindMapNodeSnapshot[] {
  const currentPath = [...path, node.id]
  result.push({ node: cloneJson(node), nodeId: node.id, parentNodeId, index, path: currentPath })
  node.children?.forEach((child, childIndex) => collectMindSnapshots(child, node.id, childIndex, currentPath, result))
  return result
}

export function mindMapNodeSnapshots(data: MindMapData, nodeIds?: string[]): MindMapNodeSnapshot[] {
  const snapshots = collectMindSnapshots(cloneMindMap(data).nodeData)
  if (!nodeIds) return snapshots
  const requested = new Set(nodeIds)
  const result = snapshots.filter((snapshot) => requested.delete(snapshot.nodeId))
  if (requested.size) throw new KnowledgeValidationError('NOT_FOUND', '部分思维导图节点不存在', [...requested])
  return result
}

function stringValues(value: JsonValue | undefined): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  return []
}

export function searchMindMapNodes(
  data: MindMapData,
  query: string,
  options: { fields?: string[]; caseSensitive?: boolean; limit?: number } = {},
): MindMapSearchResult {
  const needle = query.trim()
  if (!needle) throw new KnowledgeValidationError('INVALID_INPUT', '搜索内容不能为空')
  const limit = options.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new KnowledgeValidationError('INVALID_INDEX', '搜索结果数量无效')
  const fields = ['topic', ...(options.fields ?? [])]
  const normalized = options.caseSensitive ? needle : needle.toLocaleLowerCase()
  const hits: MindMapSearchResult['hits'] = []
  let totalMatchCount = 0
  let matchedNodeCount = 0
  for (const snapshot of mindMapNodeSnapshots(data)) {
    const matchCount = fields.flatMap((field) => stringValues(snapshot.node[field])).reduce((count, value) => {
      const haystack = options.caseSensitive ? value : value.toLocaleLowerCase()
      let from = 0
      let found = 0
      while (from <= haystack.length - normalized.length) {
        const at = haystack.indexOf(normalized, from)
        if (at < 0) break
        found += 1
        from = at + Math.max(1, normalized.length)
      }
      return count + found
    }, 0)
    if (!matchCount) continue
    matchedNodeCount += 1
    totalMatchCount += matchCount
    if (hits.length < limit) hits.push({ ...snapshot, matchCount })
  }
  return { hits, totalMatchCount, matchedNodeCount, truncated: matchedNodeCount > hits.length }
}

export function insertMindMapNodes(
  value: MindMapData,
  parentId: string,
  index: number | undefined,
  nodes: MindMapNodeData[],
): MindMapData {
  if (!nodes.length) throw new KnowledgeValidationError('INVALID_INPUT', '待插入思维导图节点不能为空')
  let data = cloneMindMap(value)
  let at = index
  for (const node of nodes) {
    data = insertMindMapNode(data, parentId, at, node)
    if (at !== undefined) at += 1
  }
  assertMindMapData(data)
  return data
}

export function updateMindMapNodes(value: MindMapData, updates: MindMapNodeUpdate[]): MindMapData {
  if (!updates.length) throw new KnowledgeValidationError('INVALID_INPUT', '思维导图节点更新不能为空')
  const data = cloneMindMap(value)
  const seen = new Set<string>()
  for (const update of updates) {
    if (seen.has(update.nodeId)) throw new KnowledgeValidationError('CONFLICT', '同一思维导图节点不能重复更新')
    seen.add(update.nodeId)
    const target = requireMindNode(data, update.nodeId).node
    applySetUnset(target, { set: update.set, unset: update.unset }, ['id', 'children'])
    target.id = update.nodeId
  }
  assertMindMapData(data)
  return data
}

export function moveMindMapNodes(value: MindMapData, moves: MindMapNodeMove[]): MindMapData {
  if (!moves.length) throw new KnowledgeValidationError('INVALID_INPUT', '思维导图移动不能为空')
  let data = cloneMindMap(value)
  for (const move of moves) data = moveMindMapNode(data, move.nodeId, move.parentNodeId, move.index)
  assertMindMapData(data)
  return data
}

export function deleteMindMapNodes(value: MindMapData, nodeIds: string[]): MindMapData {
  if (!nodeIds.length) throw new KnowledgeValidationError('INVALID_INPUT', '待删除思维导图节点不能为空')
  const paths = new Map(mindMapNodeSnapshots(value).map((snapshot) => [snapshot.nodeId, snapshot.path]))
  for (const id of nodeIds) {
    const path = paths.get(id)
    if (!path) throw new KnowledgeValidationError('NOT_FOUND', `思维导图节点不存在: ${id}`)
    for (const other of nodeIds) {
      const otherPath = paths.get(other)
      if (id !== other && otherPath && otherPath.length > path.length && path.every((item, index) => otherPath[index] === item)) {
        throw new KnowledgeValidationError('INVALID_INPUT', '删除范围不能同时包含祖先和后代节点')
      }
    }
  }
  let data = cloneMindMap(value)
  for (const id of nodeIds) data = deleteMindMapNode(data, id)
  assertMindMapData(data)
  return data
}
