import { v4 as uuidv4 } from 'uuid'
import type {
  AssetData,
  CanvasElementPatch,
  CanvasElementSnapshot,
  CanvasPlacement,
  CanvasSearchResult,
  CanvasUpdate,
  ContentEntryV2,
  ContentSummary,
  ContentType,
  DocumentNodePatch,
  DocumentNodeSnapshot,
  DocumentNodeUpdate,
  DocumentSearchResult,
  ExcalidrawElement,
  ExcalidrawScene,
  GroupEntryV2,
  JsonObject,
  JsonValue,
  KnowledgeChangeEvent,
  KnowledgeErrorCode,
  LoadedCanvas,
  LoadedDocument,
  MindMapData,
  MindMapNodeMove,
  MindMapNodeData,
  MindMapNodePatch,
  MindMapNodeSnapshot,
  MindMapNodeUpdate,
  MindMapSearchResult,
  MutationOrigin,
  Result,
  SearchHit,
  TipTapDocument,
  TipTapNode,
  TreeEntryV2,
  VaultResourceLocator,
  VaultTreeV2,
  VaultV2,
} from '../../shared/knowledge-types'
import {
  appendDocumentNodes,
  canvasElementSnapshots,
  collectDocumentReferences,
  deleteCanvasElements,
  deleteCanvasElementsStrict,
  deleteCanvasFiles,
  deleteDocumentNodes,
  deleteMindMapNode,
  deleteMindMapNodes,
  documentNodeSnapshots,
  insertCanvasElements,
  insertDocumentNodes,
  insertMindMapNode,
  insertMindMapNodes,
  mindMapNodeSnapshots,
  moveMindMapNode,
  moveMindMapNodes,
  normalizeDocumentNodeIds,
  patchCanvasElements,
  patchDocumentNode,
  patchMindMapNode,
  reorderCanvasElements,
  replaceCanvasScene,
  replaceDocumentNode,
  replaceDocumentText,
  replaceMindMapData,
  searchCanvasElements,
  searchDocumentNodeSnapshots,
  searchMindMapNodes,
  upsertCanvasElements,
  upsertCanvasFiles,
  updateCanvasScene,
  updateDocumentNodes,
  updateMindMapNodes,
} from '../../shared/knowledge-operations'
import {
  assertExcalidrawScene,
  assertMindMapData,
  assertUuid,
  KnowledgeValidationError,
  normalizeIndex,
  normalizeName,
} from '../../shared/knowledge-validation'
import { FileKnowledgeStore } from './file-knowledge-store'

export class KnowledgeError extends Error {
  constructor(
    public readonly code: KnowledgeErrorCode,
    message: string,
    public readonly details?: JsonValue,
  ) {
    super(message)
    this.name = 'KnowledgeError'
  }
}

export function asKnowledgeError(error: unknown): KnowledgeError {
  if (error instanceof KnowledgeError) return error
  if (error instanceof KnowledgeValidationError) {
    return new KnowledgeError(error.code, error.message, error.details)
  }
  return new KnowledgeError('PERSISTENCE_ERROR', '知识库操作失败')
}

export async function toResult<T>(action: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await action() }
  } catch (error) {
    const normalized = asKnowledgeError(error)
    return {
      ok: false,
      error: { code: normalized.code, message: normalized.message, details: normalized.details },
    }
  }
}

export interface KnowledgeLogEntry {
  operation: string
  code: KnowledgeErrorCode
  vaultId?: string
  resourceId?: string
}

export type KnowledgeLogger = (entry: KnowledgeLogEntry) => void
export type KnowledgeEventListener = (event: KnowledgeChangeEvent) => void

function findEntry(tree: VaultTreeV2, id: string): TreeEntryV2 {
  assertUuid(id, '树条目 ID')
  const entry = tree.entries.find((candidate) => candidate.id === id)
  if (!entry) throw new KnowledgeError('NOT_FOUND', '树条目不存在')
  return entry
}

function findContentEntry(
  tree: VaultTreeV2,
  id: string,
  expected?: ContentType,
): ContentEntryV2 {
  const entry = findEntry(tree, id)
  if (entry.kind !== 'content' || (expected && entry.contentType !== expected)) {
    throw new KnowledgeError('CONFLICT', '内容类型不匹配')
  }
  return entry
}

function requireParent(tree: VaultTreeV2, parentId: string | null): void {
  if (parentId === null) return
  const parent = findEntry(tree, parentId)
  if (parent.kind !== 'group') throw new KnowledgeError('CONFLICT', '目标父级不是分组')
}

function nextOrder(tree: VaultTreeV2, parentId: string | null): number {
  return tree.entries.filter((entry) => entry.parentId === parentId).length
}

function reorderSiblings(
  entries: TreeEntryV2[],
  moving: TreeEntryV2,
  targetParentId: string | null,
  index: number,
): TreeEntryV2[] {
  const without = entries.filter((entry) => entry.id !== moving.id)
  const siblings = without.filter((entry) => entry.parentId === targetParentId)
    .sort((a, b) => a.order - b.order)
  const targetIndex = normalizeIndex(index, siblings.length)
  const ordered = [
    ...siblings.slice(0, targetIndex),
    { ...moving, parentId: targetParentId },
    ...siblings.slice(targetIndex),
  ]
  const orderById = new Map(ordered.map((entry, order) => [entry.id, order]))
  return [...without, { ...moving, parentId: targetParentId }].map((entry) => (
    orderById.has(entry.id) ? { ...entry, order: orderById.get(entry.id)! } : entry
  ))
}

function defaultDocument(): TipTapDocument {
  return normalizeDocumentNodeIds({ type: 'doc', content: [{ type: 'paragraph' }] })
}

function defaultCanvas(): ExcalidrawScene {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'localkb',
    elements: [],
    appState: {},
    files: {},
  }
}

function extractText(node: TipTapNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(extractText).join(' ')
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const EXTENSION_MIMES: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSIONS).map(([mime, extension]) => [extension, mime]),
)

export class KnowledgeService {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly listeners = new Set<KnowledgeEventListener>()
  private readonly resourceLocators = new Map<string, Promise<VaultResourceLocator>>()

  constructor(
    private readonly storage: FileKnowledgeStore,
    private readonly logger?: KnowledgeLogger,
  ) {}

  subscribe(listener: KnowledgeEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: KnowledgeChangeEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }

  private event(
    vaultId: string,
    resourceType: KnowledgeChangeEvent['resourceType'],
    resourceId: string,
    change: KnowledgeChangeEvent['change'],
    origin: MutationOrigin,
  ): void {
    if (change === 'created' || change === 'deleted') this.resourceLocators.delete(vaultId)
    this.emit({
      vaultId, resourceType, resourceId, change, origin, changedAt: new Date().toISOString(),
    })
  }

  private resourceLocator(vaultId: string): Promise<VaultResourceLocator> {
    assertUuid(vaultId, '知识库 ID')
    const cached = this.resourceLocators.get(vaultId)
    if (cached) return cached
    const pending = this.storage.scanResourceLocator(vaultId).catch((error) => {
      this.resourceLocators.delete(vaultId)
      throw error
    })
    this.resourceLocators.set(vaultId, pending)
    return pending
  }

  async rebuildResourceLocator(vaultId: string): Promise<VaultResourceLocator> {
    this.resourceLocators.delete(vaultId)
    return this.resourceLocator(vaultId)
  }

  async locateCanvas(vaultId: string, canvasId: string) {
    assertUuid(canvasId, '画布 ID')
    const location = (await this.resourceLocator(vaultId)).canvases.get(canvasId)
    if (!location) throw new KnowledgeError('NOT_FOUND', '画布不存在')
    return location
  }

  async locateMindMap(vaultId: string, mindMapId: string) {
    assertUuid(mindMapId, '思维导图 ID')
    const location = (await this.resourceLocator(vaultId)).mindMaps.get(mindMapId)
    if (!location) throw new KnowledgeError('NOT_FOUND', '思维导图不存在')
    return location
  }

  async locateAsset(vaultId: string, assetId: string) {
    assertUuid(assetId, '附件 ID')
    const location = (await this.resourceLocator(vaultId)).assets.get(assetId)
    if (!location) throw new KnowledgeError('NOT_FOUND', '附件不存在')
    return location
  }

  private async mutate<T>(
    vaultId: string,
    operation: string,
    resourceId: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    assertUuid(vaultId, '知识库 ID')
    const previous = this.queues.get(vaultId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(action)
    const tail = current.then(() => undefined, () => undefined)
    this.queues.set(vaultId, tail)
    tail.finally(() => {
      if (this.queues.get(vaultId) === tail) this.queues.delete(vaultId)
    })
    try {
      return await current
    } catch (error) {
      const normalized = asKnowledgeError(error)
      this.logger?.({ operation, code: normalized.code, vaultId, resourceId })
      throw normalized
    }
  }

  async listVaults(): Promise<VaultV2[]> {
    return this.storage.listVaults()
  }

  async getVault(vaultId: string): Promise<VaultV2> {
    return this.storage.readVault(vaultId)
  }

  async createVault(name: string, origin: MutationOrigin = 'renderer'): Promise<VaultV2> {
    const id = uuidv4()
    const vault: VaultV2 = {
      schemaVersion: 2, id, name: normalizeName(name, '知识库名称'), createdAt: new Date().toISOString(),
    }
    return this.mutate(id, 'vault.create', id, async () => {
      try {
        await this.storage.writeVault(vault)
        await this.storage.writeTree(id, { schemaVersion: 2, entries: [] })
      } catch (error) {
        await this.storage.removeVault(id).catch(() => undefined)
        throw error
      }
      this.event(id, 'vault', id, 'created', origin)
      return vault
    })
  }

  async renameVault(
    vaultId: string,
    name: string,
    origin: MutationOrigin = 'renderer',
  ): Promise<VaultV2> {
    return this.mutate(vaultId, 'vault.rename', vaultId, async () => {
      const vault = await this.storage.readVault(vaultId)
      const updated = { ...vault, name: normalizeName(name, '知识库名称') }
      await this.storage.writeVault(updated)
      this.event(vaultId, 'vault', vaultId, 'updated', origin)
      return updated
    })
  }

  async deleteVault(vaultId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.mutate(vaultId, 'vault.delete', vaultId, async () => {
      await this.storage.readVault(vaultId)
      await this.storage.removeVault(vaultId)
      this.event(vaultId, 'vault', vaultId, 'deleted', origin)
    })
  }

  async getTree(vaultId: string): Promise<VaultTreeV2> {
    return this.storage.readTree(vaultId)
  }

  async createGroup(
    vaultId: string,
    parentId: string | null,
    name: string,
    index?: number,
    origin: MutationOrigin = 'renderer',
  ): Promise<GroupEntryV2> {
    return this.mutate(vaultId, 'tree.group.create', undefined, async () => {
      const tree = await this.storage.readTree(vaultId)
      requireParent(tree, parentId)
      const entry: GroupEntryV2 = {
        kind: 'group', id: uuidv4(), name: normalizeName(name, '分组名称'), parentId,
        order: 0,
      }
      await this.storage.writeTree(vaultId, {
        ...tree,
        entries: reorderSiblings(
          tree.entries, entry, parentId, index ?? nextOrder(tree, parentId),
        ),
      })
      this.event(vaultId, 'tree', entry.id, 'created', origin)
      return entry
    })
  }

  async renameGroup(
    vaultId: string,
    groupId: string,
    name: string,
    origin: MutationOrigin = 'renderer',
  ): Promise<GroupEntryV2> {
    return this.mutate(vaultId, 'tree.group.rename', groupId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const group = findEntry(tree, groupId)
      if (group.kind !== 'group') throw new KnowledgeError('CONFLICT', '树条目不是分组')
      const updated: GroupEntryV2 = { ...group, name: normalizeName(name, '分组名称') }
      await this.storage.writeTree(vaultId, {
        ...tree, entries: tree.entries.map((entry) => entry.id === groupId ? updated : entry),
      })
      this.event(vaultId, 'tree', groupId, 'updated', origin)
      return updated
    })
  }

  async deleteGroup(
    vaultId: string,
    groupId: string,
    origin: MutationOrigin = 'renderer',
  ): Promise<void> {
    return this.mutate(vaultId, 'tree.group.delete', groupId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const group = findEntry(tree, groupId)
      if (group.kind !== 'group') throw new KnowledgeError('CONFLICT', '树条目不是分组')
      if (tree.entries.some((entry) => entry.parentId === groupId)) {
        throw new KnowledgeError('CONFLICT', '非空分组不能删除')
      }
      await this.storage.writeTree(vaultId, {
        ...tree, entries: tree.entries.filter((entry) => entry.id !== groupId),
      })
      this.event(vaultId, 'tree', groupId, 'deleted', origin)
    })
  }

  async deleteTreeEntry(
    vaultId: string,
    entryId: string,
    origin: MutationOrigin = 'renderer',
  ): Promise<void> {
    return this.mutate(vaultId, 'tree.entry.delete', entryId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const entry = findEntry(tree, entryId)
      if (entry.kind === 'group') {
        if (tree.entries.some((candidate) => candidate.parentId === entryId)) {
          throw new KnowledgeError('CONFLICT', '非空分组不能删除')
        }
        await this.storage.writeTree(vaultId, {
          ...tree, entries: tree.entries.filter((candidate) => candidate.id !== entryId),
        })
        this.event(vaultId, 'tree', entryId, 'deleted', origin)
        return
      }
      await this.storage.stageContentDeletion(vaultId, entry.contentType, entryId)
      try {
        await this.storage.writeTree(vaultId, {
          ...tree, entries: tree.entries.filter((candidate) => candidate.id !== entryId),
        })
      } catch (error) {
        await this.storage.restoreContentDeletion(vaultId, entry.contentType, entryId)
        throw error
      }
      await this.storage.purgeContentDeletion(vaultId, entry.contentType, entryId)
      this.event(vaultId, entry.contentType, entryId, 'deleted', origin)
    })
  }

  async moveTreeEntry(
    vaultId: string,
    entryId: string,
    targetParentId: string | null,
    index: number,
    origin: MutationOrigin = 'renderer',
  ): Promise<TreeEntryV2> {
    return this.mutate(vaultId, 'tree.move', entryId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const moving = findEntry(tree, entryId)
      requireParent(tree, targetParentId)
      if (moving.kind === 'group' && targetParentId !== null) {
        let cursor: string | null = targetParentId
        while (cursor !== null) {
          if (cursor === moving.id) throw new KnowledgeError('CONFLICT', '分组不能移动到自身或后代')
          cursor = findEntry(tree, cursor).parentId
        }
      }
      const entries = reorderSiblings(tree.entries, moving, targetParentId, index)
      const committed = await this.storage.writeTree(vaultId, { ...tree, entries })
      const result = findEntry(committed, entryId)
      this.event(vaultId, 'tree', entryId, 'moved', origin)
      return result
    })
  }

  async updateTreeEntry(
    vaultId: string,
    entryId: string,
    patch: { name?: string; title?: string; parentId?: string | null; index?: number },
    origin: MutationOrigin = 'renderer',
  ): Promise<TreeEntryV2> {
    return this.mutate(vaultId, 'tree.update', entryId, async () => {
      if (!Object.keys(patch).length) throw new KnowledgeError('INVALID_INPUT', '树条目更新不能为空')
      const tree = await this.storage.readTree(vaultId)
      const current = findEntry(tree, entryId)
      let updated: TreeEntryV2
      if (current.kind === 'group') {
        if (patch.title !== undefined) throw new KnowledgeError('INVALID_INPUT', '分组不能设置标题')
        updated = patch.name === undefined ? current : { ...current, name: normalizeName(patch.name, '分组名称') }
      } else {
        if (patch.name !== undefined) throw new KnowledgeError('INVALID_INPUT', '内容条目不能设置分组名称')
        updated = patch.title === undefined ? current : {
          ...current,
          title: normalizeName(patch.title, '内容标题'),
          metadataUpdatedAt: new Date().toISOString(),
        }
      }
      let entries = tree.entries.map((entry) => entry.id === entryId ? updated : entry)
      const moving = patch.parentId !== undefined || patch.index !== undefined
      if (moving) {
        const parentId = patch.parentId === undefined ? current.parentId : patch.parentId
        requireParent(tree, parentId)
        if (updated.kind === 'group' && parentId !== null) {
          let cursor: string | null = parentId
          while (cursor !== null) {
            if (cursor === updated.id) throw new KnowledgeError('CONFLICT', '分组不能移动到自身或后代')
            cursor = findEntry(tree, cursor).parentId
          }
        }
        const max = entries.filter((entry) => entry.id !== entryId && entry.parentId === parentId).length
        entries = reorderSiblings(entries, updated, parentId, normalizeIndex(patch.index, max))
      }
      const committed = await this.storage.writeTree(vaultId, { ...tree, entries })
      const result = findEntry(committed, entryId)
      this.event(vaultId, 'tree', entryId, moving ? 'moved' : 'updated', origin)
      return result
    })
  }

  async listContent(vaultId: string): Promise<ContentSummary[]> {
    return this.storage.listContentSummaries(vaultId)
  }

  async createContent(
    vaultId: string,
    contentType: ContentType,
    title: string,
    parentId: string | null,
    index?: number,
    origin: MutationOrigin = 'renderer',
  ): Promise<ContentSummary> {
    return this.mutate(vaultId, 'content.create', undefined, async () => {
      const tree = await this.storage.readTree(vaultId)
      requireParent(tree, parentId)
      const id = uuidv4()
      const now = new Date().toISOString()
      const entry: ContentEntryV2 = {
        kind: 'content', id, contentType, title: normalizeName(title, '内容标题'), parentId,
        order: 0, createdAt: now, metadataUpdatedAt: now,
      }
      const entries = reorderSiblings(tree.entries, entry, parentId, index ?? nextOrder(tree, parentId))
      if (contentType === 'document') await this.storage.stageNewDocument(vaultId, id, defaultDocument())
      else await this.storage.stageNewCanvas(vaultId, id, defaultCanvas())
      try {
        await this.storage.writeTree(vaultId, { ...tree, entries })
        await this.storage.activateStagedContent(vaultId, contentType, id)
      } catch (error) {
        await this.storage.writeTree(vaultId, tree).catch(() => undefined)
        await this.storage.discardStagedContent(vaultId, contentType, id).catch(() => undefined)
        throw error
      }
      this.event(vaultId, contentType, id, 'created', origin)
      return this.storage.contentSummary(vaultId, entry)
    })
  }

  async renameContent(
    vaultId: string,
    contentId: string,
    title: string,
    origin: MutationOrigin = 'renderer',
  ): Promise<ContentSummary> {
    return this.mutate(vaultId, 'content.rename', contentId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const entry = findContentEntry(tree, contentId)
      const updated: ContentEntryV2 = {
        ...entry,
        title: normalizeName(title, '内容标题'),
        metadataUpdatedAt: new Date().toISOString(),
      }
      await this.storage.writeTree(vaultId, {
        ...tree, entries: tree.entries.map((candidate) => candidate.id === contentId ? updated : candidate),
      })
      this.event(vaultId, entry.contentType, contentId, 'updated', origin)
      return this.storage.contentSummary(vaultId, updated)
    })
  }

  async deleteContent(
    vaultId: string,
    contentId: string,
    origin: MutationOrigin = 'renderer',
  ): Promise<void> {
    return this.mutate(vaultId, 'content.delete', contentId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const entry = findContentEntry(tree, contentId)
      await this.storage.stageContentDeletion(vaultId, entry.contentType, contentId)
      try {
        await this.storage.writeTree(vaultId, {
          ...tree, entries: tree.entries.filter((candidate) => candidate.id !== contentId),
        })
      } catch (error) {
        await this.storage.restoreContentDeletion(vaultId, entry.contentType, contentId)
        throw error
      }
      await this.storage.purgeContentDeletion(vaultId, entry.contentType, contentId)
      this.event(vaultId, entry.contentType, contentId, 'deleted', origin)
    })
  }

  async getDocument(vaultId: string, documentId: string): Promise<LoadedDocument> {
    const tree = await this.storage.readTree(vaultId)
    const entry = findContentEntry(tree, documentId, 'document')
    const [summary, content] = await Promise.all([
      this.storage.contentSummary(vaultId, entry), this.storage.readDocument(vaultId, documentId),
    ])
    return { ...summary, contentType: 'document', content }
  }

  private async validateDocumentReferences(
    vaultId: string,
    documentId: string,
    document: TipTapDocument,
  ): Promise<void> {
    for (const reference of collectDocumentReferences(document)) {
      assertUuid(reference.id, '文档资源引用 ID')
      if (reference.type === 'canvas') await this.storage.readCanvas(vaultId, reference.id, documentId)
      else if (reference.type === 'mindmap') await this.storage.readMindMap(vaultId, documentId, reference.id)
      else await this.storage.findAsset(vaultId, documentId, reference.id)
    }
  }

  private async replaceDocumentCommitted(
    vaultId: string,
    documentId: string,
    value: TipTapDocument,
    origin: MutationOrigin,
  ): Promise<LoadedDocument> {
    const normalized = normalizeDocumentNodeIds(value)
    const tree = await this.storage.readTree(vaultId)
    findContentEntry(tree, documentId, 'document')
    await this.validateDocumentReferences(vaultId, documentId, normalized)
    await this.storage.writeDocument(vaultId, documentId, normalized)
    this.event(vaultId, 'document', documentId, 'updated', origin)
    return this.getDocument(vaultId, documentId)
  }

  async replaceDocument(
    vaultId: string,
    documentId: string,
    value: TipTapDocument,
    origin: MutationOrigin = 'renderer',
  ): Promise<LoadedDocument> {
    return this.mutate(vaultId, 'document.replace', documentId, () => (
      this.replaceDocumentCommitted(vaultId, documentId, value, origin)
    ))
  }

  async updateDocument(
    vaultId: string,
    documentId: string,
    patch: { title?: string; content?: TipTapDocument },
    origin: MutationOrigin = 'renderer',
  ): Promise<LoadedDocument> {
    return this.mutate(vaultId, 'document.update', documentId, async () => {
      if (patch.title === undefined && patch.content === undefined) {
        throw new KnowledgeError('INVALID_INPUT', '文档更新不能为空')
      }
      const tree = await this.storage.readTree(vaultId)
      const entry = findContentEntry(tree, documentId, 'document')
      const updatedEntry: ContentEntryV2 = patch.title === undefined ? entry : {
        ...entry,
        title: normalizeName(patch.title, '内容标题'),
        metadataUpdatedAt: new Date().toISOString(),
      }
      const nextTree: VaultTreeV2 = {
        ...tree,
        entries: tree.entries.map((candidate) => candidate.id === documentId ? updatedEntry : candidate),
      }
      const previousDocument = patch.content === undefined ? undefined : await this.storage.readDocument(vaultId, documentId)
      const normalized = patch.content === undefined
        ? undefined
        : normalizeDocumentNodeIds(patch.content)
      if (normalized) await this.validateDocumentReferences(vaultId, documentId, normalized)
      try {
        if (normalized) await this.storage.writeDocument(vaultId, documentId, normalized)
        if (patch.title !== undefined) await this.storage.writeTree(vaultId, nextTree)
      } catch (error) {
        if (normalized && previousDocument) {
          await this.storage.writeDocument(vaultId, documentId, previousDocument).catch(() => undefined)
        }
        if (patch.title !== undefined) await this.storage.writeTree(vaultId, tree).catch(() => undefined)
        throw error
      }
      this.event(vaultId, 'document', documentId, 'updated', origin)
      return this.getDocument(vaultId, documentId)
    })
  }

  private async editDocument(
    vaultId: string,
    documentId: string,
    origin: MutationOrigin,
    operation: string,
    edit: (value: TipTapDocument) => TipTapDocument,
  ): Promise<LoadedDocument> {
    return this.mutate(vaultId, operation, documentId, async () => {
      const value = await this.storage.readDocument(vaultId, documentId)
      return this.replaceDocumentCommitted(vaultId, documentId, edit(value), origin)
    })
  }

  insertDocumentNodes(vaultId: string, documentId: string, parentNodeId: string | null, index: number | undefined, nodes: TipTapNode[], origin: MutationOrigin = 'renderer'): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.nodes.insert',
      (value) => insertDocumentNodes(value, parentNodeId, index, nodes))
  }

  insertDocumentNodeBatch(
    vaultId: string,
    documentId: string,
    parentNodeId: string | null,
    index: number | undefined,
    nodes: TipTapNode[],
    origin: MutationOrigin = 'renderer',
  ): Promise<DocumentNodeSnapshot[]> {
    return this.mutate(vaultId, 'document.nodes.insert', documentId, async () => {
      const current = await this.storage.readDocument(vaultId, documentId)
      const before = new Set(documentNodeSnapshots(documentId, current).map((snapshot) => snapshot.nodeId))
      const next = insertDocumentNodes(current, parentNodeId, index, nodes)
      const loaded = await this.replaceDocumentCommitted(vaultId, documentId, next, origin)
      return documentNodeSnapshots(documentId, loaded.content).filter((snapshot) => !before.has(snapshot.nodeId))
    })
  }

  appendDocumentNodes(vaultId: string, documentId: string, parentNodeId: string | null, nodes: TipTapNode[], origin: MutationOrigin = 'renderer'): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.nodes.append',
      (value) => appendDocumentNodes(value, parentNodeId, nodes))
  }

  replaceDocumentNode(vaultId: string, documentId: string, nodeId: string, node: TipTapNode, origin: MutationOrigin = 'renderer'): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.node.replace',
      (value) => replaceDocumentNode(value, nodeId, node))
  }

  patchDocumentNode(vaultId: string, documentId: string, nodeId: string, patch: DocumentNodePatch, origin: MutationOrigin = 'renderer'): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.node.patch',
      (value) => patchDocumentNode(value, nodeId, patch))
  }

  replaceDocumentText(vaultId: string, documentId: string, nodeId: string, from: number, to: number, replacement: string, origin: MutationOrigin = 'renderer'): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.text.replace',
      (value) => replaceDocumentText(value, nodeId, from, to, replacement))
  }

  deleteDocumentNodes(vaultId: string, documentId: string, nodeIds: string[], origin: MutationOrigin = 'renderer'): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.nodes.delete',
      (value) => deleteDocumentNodes(value, nodeIds))
  }

  async getDocumentNodeSnapshots(
    vaultId: string,
    documentId: string,
    nodeIds?: string[],
  ): Promise<DocumentNodeSnapshot[]> {
    const loaded = await this.getDocument(vaultId, documentId)
    return documentNodeSnapshots(documentId, loaded.content, nodeIds)
  }

  async searchDocumentNodes(
    vaultId: string,
    query: string,
    options: { documentId?: string; nodeTypes?: string[]; caseSensitive?: boolean; limit?: number } = {},
  ): Promise<DocumentSearchResult> {
    const limit = options.limit ?? 50
    const documentIds = options.documentId
      ? [options.documentId]
      : (await this.listContent(vaultId)).filter((item) => item.contentType === 'document').map((item) => item.id)
    const result: DocumentSearchResult = {
      hits: [], totalMatchCount: 0, matchedNodeCount: 0, truncated: false,
    }
    for (const documentId of documentIds) {
      const loaded = await this.getDocument(vaultId, documentId)
      const current = searchDocumentNodeSnapshots(documentId, loaded.content, query, {
        nodeTypes: options.nodeTypes,
        caseSensitive: options.caseSensitive,
        limit,
      })
      result.totalMatchCount += current.totalMatchCount
      result.matchedNodeCount += current.matchedNodeCount
      result.hits.push(...current.hits.slice(0, Math.max(0, limit - result.hits.length)))
    }
    result.truncated = result.matchedNodeCount > result.hits.length
    return result
  }

  updateDocumentNodeBatch(
    vaultId: string,
    documentId: string,
    updates: DocumentNodeUpdate[],
    origin: MutationOrigin = 'renderer',
  ): Promise<LoadedDocument> {
    return this.editDocument(vaultId, documentId, origin, 'document.nodes.update',
      (value) => updateDocumentNodes(value, updates))
  }

  async getCanvas(vaultId: string, canvasId: string, documentId?: string): Promise<ExcalidrawScene | LoadedCanvas> {
    if (documentId) return this.storage.readCanvas(vaultId, canvasId, documentId)
    const location = await this.locateCanvas(vaultId, canvasId)
    if (location.scope === 'embedded') return this.storage.readCanvas(vaultId, canvasId, location.documentId)
    const entry = findContentEntry(await this.storage.readTree(vaultId), canvasId, 'canvas')
    const [summary, content] = await Promise.all([
      this.storage.contentSummary(vaultId, entry), this.storage.readCanvas(vaultId, canvasId),
    ])
    return { ...summary, contentType: 'canvas', content }
  }

  async createEmbeddedCanvas(
    vaultId: string,
    documentId: string,
    value: ExcalidrawScene,
    origin: MutationOrigin = 'renderer',
  ): Promise<{ id: string; content: ExcalidrawScene }> {
    return this.mutate(vaultId, 'canvas.embedded.create', documentId, async () => {
      await this.getDocument(vaultId, documentId)
      const id = uuidv4()
      const content = replaceCanvasScene(value)
      await this.storage.writeCanvas(vaultId, id, content, documentId)
      this.event(vaultId, 'canvas', id, 'created', origin)
      return { id, content }
    })
  }

  private async mutateCanvas(
    vaultId: string,
    canvasId: string,
    documentId: string | undefined,
    origin: MutationOrigin,
    operation: string,
    edit: (value: ExcalidrawScene) => ExcalidrawScene,
  ): Promise<ExcalidrawScene> {
    return this.mutate(vaultId, operation, canvasId, async () => {
      const location = documentId
        ? { scope: 'embedded' as const, documentId }
        : await this.locateCanvas(vaultId, canvasId)
      if (location.scope === 'top-level') findContentEntry(await this.storage.readTree(vaultId), canvasId, 'canvas')
      const owner = location.scope === 'embedded' ? location.documentId : undefined
      const value = await this.storage.readCanvas(vaultId, canvasId, owner)
      const updated = edit(value)
      assertExcalidrawScene(updated)
      await this.storage.writeCanvas(vaultId, canvasId, updated, owner)
      this.event(vaultId, 'canvas', canvasId, 'updated', origin)
      return updated
    })
  }

  replaceCanvas(vaultId: string, canvasId: string, value: ExcalidrawScene, documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.replace', () => replaceCanvasScene(value))
  }

  upsertCanvasElements(vaultId: string, canvasId: string, elements: ExcalidrawElement[], documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.elements.upsert', (value) => upsertCanvasElements(value, elements))
  }

  patchCanvasElements(vaultId: string, canvasId: string, patches: CanvasElementPatch[], documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.elements.patch', (value) => patchCanvasElements(value, patches))
  }

  deleteCanvasElements(vaultId: string, canvasId: string, elementIds: string[], documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.elements.delete', (value) => deleteCanvasElements(value, elementIds))
  }

  reorderCanvasElements(vaultId: string, canvasId: string, orderedIds: string[], documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.elements.reorder', (value) => reorderCanvasElements(value, orderedIds))
  }

  upsertCanvasFiles(vaultId: string, canvasId: string, files: Record<string, JsonObject>, documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.files.upsert', (value) => upsertCanvasFiles(value, files))
  }

  deleteCanvasFiles(vaultId: string, canvasId: string, fileIds: string[], documentId?: string, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, documentId, origin, 'canvas.files.delete', (value) => deleteCanvasFiles(value, fileIds))
  }

  async deleteEmbeddedCanvas(vaultId: string, documentId: string, canvasId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.mutate(vaultId, 'canvas.embedded.delete', canvasId, async () => {
      const document = await this.storage.readDocument(vaultId, documentId)
      if (collectDocumentReferences(document).some((reference) => reference.type === 'canvas' && reference.id === canvasId)) {
        throw new KnowledgeError('CONFLICT', '画布仍被文档引用')
      }
      await this.storage.deleteCanvas(vaultId, canvasId, documentId)
      this.event(vaultId, 'canvas', canvasId, 'deleted', origin)
    })
  }

  async getCanvasScene(vaultId: string, canvasId: string): Promise<ExcalidrawScene> {
    const loaded = await this.getCanvas(vaultId, canvasId)
    return (loaded as LoadedCanvas).contentType === 'canvas'
      ? (loaded as LoadedCanvas).content
      : loaded as ExcalidrawScene
  }

  async getCanvasElementSnapshots(
    vaultId: string,
    canvasId: string,
    elementIds?: string[],
  ): Promise<CanvasElementSnapshot[]> {
    return canvasElementSnapshots(await this.getCanvasScene(vaultId, canvasId), elementIds)
  }

  async searchCanvas(
    vaultId: string,
    canvasId: string,
    query: string,
    options: Parameters<typeof searchCanvasElements>[2] = {},
  ): Promise<CanvasSearchResult> {
    return searchCanvasElements(await this.getCanvasScene(vaultId, canvasId), query, options)
  }

  insertCanvasElementBatch(
    vaultId: string,
    canvasId: string,
    elements: ExcalidrawElement[],
    files: Record<string, JsonObject> | undefined,
    placement: CanvasPlacement,
    origin: MutationOrigin = 'renderer',
  ): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, undefined, origin, 'canvas.elements.insert',
      (value) => insertCanvasElements(value, elements, files, placement))
  }

  updateCanvas(
    vaultId: string,
    canvasId: string,
    update: CanvasUpdate,
    origin: MutationOrigin = 'renderer',
  ): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, undefined, origin, 'canvas.update',
      (value) => updateCanvasScene(value, update))
  }

  deleteCanvasElementBatch(
    vaultId: string,
    canvasId: string,
    elementIds: string[],
    removeUnreferencedFiles = false,
    origin: MutationOrigin = 'renderer',
  ): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, undefined, origin, 'canvas.elements.delete-strict',
      (value) => deleteCanvasElementsStrict(value, elementIds, removeUnreferencedFiles))
  }

  async removeCanvas(vaultId: string, canvasId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    const location = await this.locateCanvas(vaultId, canvasId)
    if (location.scope === 'top-level') throw new KnowledgeError('CONFLICT', '顶层画布请使用 tree_delete 删除')
    return this.deleteEmbeddedCanvas(vaultId, location.documentId, canvasId, origin)
  }

  async createMindMap(vaultId: string, documentId: string, value: MindMapData, origin: MutationOrigin = 'renderer'): Promise<{ id: string; content: MindMapData }> {
    return this.mutate(vaultId, 'mindmap.create', documentId, async () => {
      await this.getDocument(vaultId, documentId)
      const id = uuidv4()
      const content = replaceMindMapData(value)
      await this.storage.writeMindMap(vaultId, documentId, id, content)
      this.event(vaultId, 'mindmap', id, 'created', origin)
      return { id, content }
    })
  }

  getMindMap(vaultId: string, documentId: string, mindMapId: string): Promise<MindMapData> {
    return this.storage.readMindMap(vaultId, documentId, mindMapId)
  }

  private async mutateMindMap(vaultId: string, documentId: string, mindMapId: string, origin: MutationOrigin, operation: string, edit: (value: MindMapData) => MindMapData): Promise<MindMapData> {
    return this.mutate(vaultId, operation, mindMapId, async () => {
      const value = await this.storage.readMindMap(vaultId, documentId, mindMapId)
      const updated = edit(value)
      assertMindMapData(updated)
      await this.storage.writeMindMap(vaultId, documentId, mindMapId, updated)
      this.event(vaultId, 'mindmap', mindMapId, 'updated', origin)
      return updated
    })
  }

  replaceMindMap(vaultId: string, documentId: string, mindMapId: string, value: MindMapData, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, documentId, mindMapId, origin, 'mindmap.replace', () => replaceMindMapData(value))
  }

  insertMindMapNode(vaultId: string, documentId: string, mindMapId: string, parentId: string, index: number | undefined, node: MindMapNodeData, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, documentId, mindMapId, origin, 'mindmap.node.insert', (value) => insertMindMapNode(value, parentId, index, node))
  }

  patchMindMapNode(vaultId: string, documentId: string, mindMapId: string, patch: MindMapNodePatch, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, documentId, mindMapId, origin, 'mindmap.node.patch', (value) => patchMindMapNode(value, patch))
  }

  moveMindMapNode(vaultId: string, documentId: string, mindMapId: string, nodeId: string, parentId: string, index: number | undefined, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, documentId, mindMapId, origin, 'mindmap.node.move', (value) => moveMindMapNode(value, nodeId, parentId, index))
  }

  deleteMindMapNode(vaultId: string, documentId: string, mindMapId: string, nodeId: string, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, documentId, mindMapId, origin, 'mindmap.node.delete', (value) => deleteMindMapNode(value, nodeId))
  }

  async deleteMindMap(vaultId: string, documentId: string, mindMapId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.mutate(vaultId, 'mindmap.delete', mindMapId, async () => {
      const document = await this.storage.readDocument(vaultId, documentId)
      if (collectDocumentReferences(document).some((reference) => reference.type === 'mindmap' && reference.id === mindMapId)) {
        throw new KnowledgeError('CONFLICT', '思维导图仍被文档引用')
      }
      await this.storage.deleteMindMap(vaultId, documentId, mindMapId)
      this.event(vaultId, 'mindmap', mindMapId, 'deleted', origin)
    })
  }

  async getMindMapById(vaultId: string, mindMapId: string): Promise<MindMapData> {
    const { documentId } = await this.locateMindMap(vaultId, mindMapId)
    return this.storage.readMindMap(vaultId, documentId, mindMapId)
  }

  async getMindMapNodeSnapshots(
    vaultId: string,
    mindMapId: string,
    nodeIds?: string[],
  ): Promise<MindMapNodeSnapshot[]> {
    return mindMapNodeSnapshots(await this.getMindMapById(vaultId, mindMapId), nodeIds)
  }

  async searchMindMap(
    vaultId: string,
    mindMapId: string,
    query: string,
    options: Parameters<typeof searchMindMapNodes>[2] = {},
  ): Promise<MindMapSearchResult> {
    return searchMindMapNodes(await this.getMindMapById(vaultId, mindMapId), query, options)
  }

  private async mutateMindMapById(
    vaultId: string,
    mindMapId: string,
    origin: MutationOrigin,
    operation: string,
    edit: (value: MindMapData) => MindMapData,
  ): Promise<MindMapData> {
    const { documentId } = await this.locateMindMap(vaultId, mindMapId)
    return this.mutateMindMap(vaultId, documentId, mindMapId, origin, operation, edit)
  }

  insertMindMapNodeBatch(
    vaultId: string,
    mindMapId: string,
    parentNodeId: string,
    index: number | undefined,
    nodes: MindMapNodeData[],
    origin: MutationOrigin = 'renderer',
  ): Promise<MindMapData> {
    return this.mutateMindMapById(vaultId, mindMapId, origin, 'mindmap.nodes.insert',
      (value) => insertMindMapNodes(value, parentNodeId, index, nodes))
  }

  updateMindMapNodeBatch(
    vaultId: string,
    mindMapId: string,
    updates: MindMapNodeUpdate[],
    origin: MutationOrigin = 'renderer',
  ): Promise<MindMapData> {
    return this.mutateMindMapById(vaultId, mindMapId, origin, 'mindmap.nodes.update',
      (value) => updateMindMapNodes(value, updates))
  }

  moveMindMapNodeBatch(
    vaultId: string,
    mindMapId: string,
    moves: MindMapNodeMove[],
    origin: MutationOrigin = 'renderer',
  ): Promise<MindMapData> {
    return this.mutateMindMapById(vaultId, mindMapId, origin, 'mindmap.nodes.move',
      (value) => moveMindMapNodes(value, moves))
  }

  deleteMindMapNodeBatch(
    vaultId: string,
    mindMapId: string,
    nodeIds: string[],
    origin: MutationOrigin = 'renderer',
  ): Promise<MindMapData> {
    return this.mutateMindMapById(vaultId, mindMapId, origin, 'mindmap.nodes.delete',
      (value) => deleteMindMapNodes(value, nodeIds))
  }

  async removeMindMap(vaultId: string, mindMapId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    const { documentId } = await this.locateMindMap(vaultId, mindMapId)
    return this.deleteMindMap(vaultId, documentId, mindMapId, origin)
  }

  async importAsset(vaultId: string, documentId: string, mimeType: string, bytes: Uint8Array, origin: MutationOrigin = 'renderer'): Promise<{ id: string; mimeType: string }> {
    return this.mutate(vaultId, 'asset.import', documentId, async () => {
      await this.getDocument(vaultId, documentId)
      const extension = MIME_EXTENSIONS[mimeType.toLowerCase()]
      if (!extension || !(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new KnowledgeError('INVALID_INPUT', '图片类型或内容无效')
      }
      const id = uuidv4()
      await this.storage.writeAsset(vaultId, documentId, id, extension, bytes)
      this.event(vaultId, 'asset', id, 'created', origin)
      return { id, mimeType: mimeType.toLowerCase() }
    })
  }

  async readAsset(vaultId: string, documentId: string, assetId: string): Promise<AssetData> {
    const target = await this.storage.findAsset(vaultId, documentId, assetId)
    const extension = target.slice(target.lastIndexOf('.') + 1).toLowerCase()
    return {
      id: assetId,
      mimeType: EXTENSION_MIMES[extension] ?? 'application/octet-stream',
      bytes: await this.storage.readAsset(vaultId, documentId, assetId),
    }
  }

  async deleteAsset(vaultId: string, documentId: string, assetId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.mutate(vaultId, 'asset.delete', assetId, async () => {
      const document = await this.storage.readDocument(vaultId, documentId)
      if (collectDocumentReferences(document).some((reference) => reference.type === 'asset' && reference.id === assetId)) {
        throw new KnowledgeError('CONFLICT', '图片资源仍被文档引用')
      }
      await this.storage.deleteAsset(vaultId, documentId, assetId)
      this.event(vaultId, 'asset', assetId, 'deleted', origin)
    })
  }

  async readAssetById(vaultId: string, assetId: string): Promise<AssetData & { documentId: string }> {
    const { documentId } = await this.locateAsset(vaultId, assetId)
    return { ...await this.readAsset(vaultId, documentId, assetId), documentId }
  }

  async removeAsset(vaultId: string, assetId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    const { documentId } = await this.locateAsset(vaultId, assetId)
    return this.deleteAsset(vaultId, documentId, assetId, origin)
  }

  async findResourceReferences(
    vaultId: string,
    type: 'canvas' | 'mindmap' | 'asset',
    resourceId: string,
  ): Promise<Array<{ documentId: string; nodeId: string }>> {
    const documents = (await this.listContent(vaultId)).filter((item) => item.contentType === 'document')
    const result: Array<{ documentId: string; nodeId: string }> = []
    for (const document of documents) {
      const content = (await this.getDocument(vaultId, document.id)).content
      for (const reference of collectDocumentReferences(content)) {
        if (reference.type === type && reference.id === resourceId) {
          result.push({ documentId: document.id, nodeId: reference.nodeId })
        }
      }
    }
    return result
  }

  async search(vaultId: string, query: string, limit = 50): Promise<SearchHit[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new KnowledgeError('INVALID_INDEX', '搜索结果数量无效')
    }
    const tree = await this.storage.readTree(vaultId)
    const byId = new Map(tree.entries.map((entry) => [entry.id, entry]))
    const groupPath = (parentId: string | null): string[] => {
      const result: string[] = []
      let cursor = parentId
      while (cursor !== null) {
        const parent = byId.get(cursor)
        if (!parent || parent.kind !== 'group') break
        result.unshift(parent.name)
        cursor = parent.parentId
      }
      return result
    }
    const summaries = await this.storage.listContentSummaries(vaultId)
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return summaries.slice(0, limit).map((summary) => ({
        id: summary.id,
        contentType: summary.contentType,
        title: summary.title,
        path: groupPath(summary.parentId),
        updatedAt: summary.updatedAt,
      }))
    }
    const hits: SearchHit[] = []
    for (const summary of summaries) {
      if (hits.length >= limit) break
      const titleMatches = summary.title.toLowerCase().includes(normalized)
      let text = ''
      if (!titleMatches && summary.contentType === 'document') {
        text = extractText(await this.storage.readDocument(vaultId, summary.id))
      }
      const at = text.toLowerCase().indexOf(normalized)
      if (!titleMatches && at < 0) continue
      hits.push({
        id: summary.id,
        contentType: summary.contentType,
        title: summary.title,
        path: groupPath(summary.parentId),
        updatedAt: summary.updatedAt,
        ...(at >= 0 ? { snippet: text.slice(Math.max(0, at - 40), at + normalized.length + 80) } : {}),
      })
    }
    return hits
  }
}
