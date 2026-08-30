import { v4 as uuidv4 } from 'uuid'
import { VAULT_FORMAT_VERSIONS } from '../../shared/knowledge-types'
import type {
  AssetData,
  AssetMetadata,
  CanvasElementPatch,
  CanvasElementSnapshot,
  CanvasPlacement,
  CanvasSearchResult,
  CanvasUpdate,
  ContentEntryV3,
  ContentSummary,
  ContentType,
  DocumentNodePatch,
  DocumentNodeSnapshot,
  DocumentNodeUpdate,
  DocumentSearchResult,
  ExcalidrawElement,
  ExcalidrawScene,
  GroupEntryV3,
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
  RendererResourceInsertion,
  RendererResourceInsertionResult,
  Result,
  SearchHit,
  TipTapDocument,
  TipTapNode,
  TreeEntryV3,
  VaultResourceLocator,
  VaultTreeV3,
  VaultV3,
  VaultIntegrityReport,
} from '../../shared/knowledge-types'
import {
  appendDocumentNodes,
  canvasElementSnapshots,
  collectDocumentReferences,
  collectFileAttachmentReferences,
  collectInternalDocumentReferences,
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
  assertPathSegment,
  assertUuid,
  KnowledgeValidationError,
  normalizeIndex,
  normalizeName,
} from '../../shared/knowledge-validation'
import { FileKnowledgeStore } from './file-knowledge-store'
import { inspectVaultIntegrity } from './knowledge-integrity'

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

function findEntry(tree: VaultTreeV3, id: string): TreeEntryV3 {
  assertUuid(id, '树条目 ID')
  const entry = tree.entries.find((candidate) => candidate.id === id)
  if (!entry) throw new KnowledgeError('NOT_FOUND', '树条目不存在')
  return entry
}

function findContentEntry(
  tree: VaultTreeV3,
  id: string,
  expected?: ContentType,
): ContentEntryV3 {
  const entry = findEntry(tree, id)
  if (entry.kind !== 'content' || (expected && entry.contentType !== expected)) {
    throw new KnowledgeError('CONFLICT', '内容类型不匹配')
  }
  return entry
}

function requireParent(tree: VaultTreeV3, parentId: string | null): void {
  if (parentId === null) return
  const parent = findEntry(tree, parentId)
  if (parent.kind !== 'group') throw new KnowledgeError('CONFLICT', '目标父级不是分组')
}

function nextOrder(tree: VaultTreeV3, parentId: string | null): number {
  return tree.entries.filter((entry) => entry.parentId === parentId).length
}

function reorderSiblings(
  entries: TreeEntryV3[],
  moving: TreeEntryV3,
  targetParentId: string | null,
  index: number,
): TreeEntryV3[] {
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

function defaultMindMap(): MindMapData {
  return { nodeData: { id: uuidv4(), topic: '中心主题' } }
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
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

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

  async inspectIntegrity(vaultId: string, fullAssetHash = false): Promise<VaultIntegrityReport> {
    return inspectVaultIntegrity(this.storage, vaultId, { fullAssetHash })
  }

  async locateCanvas(vaultId: string, canvasId: string) {
    assertUuid(canvasId, '画布 ID')
    if (!(await this.resourceLocator(vaultId)).canvases.has(canvasId)) {
      throw new KnowledgeError('NOT_FOUND', '画布不存在')
    }
    return { id: canvasId }
  }

  async locateMindMap(vaultId: string, mindMapId: string) {
    assertUuid(mindMapId, '思维导图 ID')
    if (!(await this.resourceLocator(vaultId)).mindMaps.has(mindMapId)) {
      throw new KnowledgeError('NOT_FOUND', '思维导图不存在')
    }
    return { id: mindMapId }
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

  async listVaults(): Promise<VaultV3[]> {
    return this.storage.listVaults()
  }

  async getVault(vaultId: string): Promise<VaultV3> {
    return this.storage.readVault(vaultId)
  }

  async createVault(name: string, origin: MutationOrigin = 'renderer'): Promise<VaultV3> {
    const id = uuidv4()
    const vault: VaultV3 = {
      schemaVersion: 3, formatVersions: { ...VAULT_FORMAT_VERSIONS },
      id, name: normalizeName(name, '知识库名称'), createdAt: new Date().toISOString(),
    }
    return this.mutate(id, 'vault.create', id, async () => {
      try {
        await this.storage.writeVault(vault)
        await this.storage.writeTree(id, { schemaVersion: 3, entries: [] })
        await this.storage.initializeAssetManifest(id)
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
  ): Promise<VaultV3> {
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

  async getTree(vaultId: string): Promise<VaultTreeV3> {
    return this.storage.readTree(vaultId)
  }

  async createGroup(
    vaultId: string,
    parentId: string | null,
    name: string,
    index?: number,
    origin: MutationOrigin = 'renderer',
  ): Promise<GroupEntryV3> {
    return this.mutate(vaultId, 'tree.group.create', undefined, async () => {
      const tree = await this.storage.readTree(vaultId)
      requireParent(tree, parentId)
      const entry: GroupEntryV3 = {
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
  ): Promise<GroupEntryV3> {
    return this.mutate(vaultId, 'tree.group.rename', groupId, async () => {
      const tree = await this.storage.readTree(vaultId)
      const group = findEntry(tree, groupId)
      if (group.kind !== 'group') throw new KnowledgeError('CONFLICT', '树条目不是分组')
      const updated: GroupEntryV3 = { ...group, name: normalizeName(name, '分组名称') }
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
      if (entry.contentType === 'document') {
        await this.assertDocumentNotReferenced(vaultId, entryId, tree)
      } else {
        const references = await this.findResourceReferences(vaultId, entry.contentType, entryId)
        if (references.length > 0) {
          throw new KnowledgeError(
            'CONFLICT', `资源仍被 ${references.length} 处引用，不能删除`, references,
          )
        }
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
  ): Promise<TreeEntryV3> {
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
  ): Promise<TreeEntryV3> {
    return this.mutate(vaultId, 'tree.update', entryId, async () => {
      if (!Object.keys(patch).length) throw new KnowledgeError('INVALID_INPUT', '树条目更新不能为空')
      const tree = await this.storage.readTree(vaultId)
      const current = findEntry(tree, entryId)
      let updated: TreeEntryV3
      if (current.kind === 'group') {
        if (patch.title !== undefined) throw new KnowledgeError('INVALID_INPUT', '分组不能设置标题')
        updated = patch.name === undefined ? current : { ...current, name: normalizeName(patch.name, '分组名称') }
      } else {
        if (patch.name !== undefined) throw new KnowledgeError('INVALID_INPUT', '内容条目不能设置分组名称')
        updated = patch.title === undefined ? current : {
          ...current,
          title: normalizeName(patch.title, '内容标题'),
          updatedAt: new Date().toISOString(),
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
      const entry: ContentEntryV3 = {
        kind: 'content', id, contentType, title: normalizeName(title, '内容标题'), parentId,
        order: 0, createdAt: now, updatedAt: now,
      }
      const entries = reorderSiblings(tree.entries, entry, parentId, index ?? nextOrder(tree, parentId))
      if (contentType === 'document') await this.storage.stageNewDocument(vaultId, id, defaultDocument())
      else if (contentType === 'canvas') await this.storage.stageNewCanvas(vaultId, id, defaultCanvas())
      else await this.storage.stageNewMindMap(vaultId, id, defaultMindMap())
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
      const updated: ContentEntryV3 = {
        ...entry,
        title: normalizeName(title, '内容标题'),
        updatedAt: new Date().toISOString(),
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
      if (entry.contentType === 'document') {
        await this.assertDocumentNotReferenced(vaultId, contentId, tree)
      } else {
        const references = await this.findResourceReferences(vaultId, entry.contentType, contentId)
        if (references.length > 0) {
          throw new KnowledgeError(
            'CONFLICT', `资源仍被 ${references.length} 处引用，不能删除`, references,
          )
        }
      }
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
    _documentId: string,
    document: TipTapDocument,
  ): Promise<void> {
    for (const reference of collectDocumentReferences(document)) {
      assertUuid(reference.id, '文档资源引用 ID')
      if (reference.type === 'canvas') await this.storage.readCanvas(vaultId, reference.id)
      else if (reference.type === 'mindmap') await this.storage.readMindMap(vaultId, reference.id)
      else await this.storage.readAsset(vaultId, reference.id)
    }
    const tree = await this.storage.readTree(vaultId)
    for (const reference of collectInternalDocumentReferences(document)) {
      findContentEntry(tree, reference.documentId, 'document')
    }
    for (const attachment of collectFileAttachmentReferences(document)) {
      await this.storage.readAsset(vaultId, attachment.assetId)
    }
  }

  private async assertDocumentNotReferenced(
    vaultId: string,
    targetDocumentId: string,
    tree: VaultTreeV3,
  ): Promise<void> {
    const sources: Array<{ documentId: string; title: string; nodeId: string }> = []
    for (const entry of tree.entries) {
      if (
        entry.kind !== 'content' || entry.contentType !== 'document' ||
        entry.id === targetDocumentId
      ) continue
      const content = await this.storage.readDocument(vaultId, entry.id)
      for (const reference of collectInternalDocumentReferences(content)) {
        if (reference.documentId === targetDocumentId) {
          sources.push({ documentId: entry.id, title: entry.title, nodeId: reference.nodeId })
        }
      }
    }
    if (sources.length > 0) {
      throw new KnowledgeError(
        'CONFLICT',
        `文档仍被 ${sources.length} 处内部引用，不能删除`,
        sources,
      )
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
    const entry = findContentEntry(tree, documentId, 'document')
    await this.validateDocumentReferences(vaultId, documentId, normalized)
    const previous = await this.storage.readDocument(vaultId, documentId)
    const updatedEntry: ContentEntryV3 = { ...entry, updatedAt: new Date().toISOString() }
    try {
      await this.storage.writeDocument(vaultId, documentId, normalized)
      await this.storage.writeTree(vaultId, {
        ...tree,
        entries: tree.entries.map((candidate) => candidate.id === documentId ? updatedEntry : candidate),
      })
    } catch (error) {
      await this.storage.writeDocument(vaultId, documentId, previous).catch(() => undefined)
      throw error
    }
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

  async insertRendererResource(
    vaultId: string,
    documentId: string,
    nextDocument: TipTapDocument,
    resource: RendererResourceInsertion,
    origin: MutationOrigin = 'renderer',
  ): Promise<RendererResourceInsertionResult> {
    return this.mutate(vaultId, 'document.resource.insert', documentId, async () => {
      assertUuid(resource.resourceId, '新资源 ID')
      const inventory = await this.storage.scanResourceLocator(vaultId)
      if (
        inventory.documents.has(resource.resourceId) || inventory.canvases.has(resource.resourceId) ||
        inventory.mindMaps.has(resource.resourceId) || inventory.assets.has(resource.resourceId)
      ) throw new KnowledgeError('CONFLICT', '新资源 ID 已存在')

      const normalized = normalizeDocumentNodeIds(nextDocument)
      if (!collectDocumentReferences(normalized).some((reference) => (
        reference.type === resource.resourceType && reference.id === resource.resourceId
      ))) throw new KnowledgeError('INVALID_INPUT', '文档未包含新资源的引用节点')

      const tree = await this.storage.readTree(vaultId)
      const entry = findContentEntry(tree, documentId, 'document')
      const previousDocument = await this.storage.readDocument(vaultId, documentId)
      const updatedEntry: ContentEntryV3 = { ...entry, updatedAt: new Date().toISOString() }
      let resourceCreated = false
      let documentWritten = false
      let treeWritten = false
      let asset: AssetMetadata | undefined
      try {
        if (resource.resourceType === 'canvas') {
          await this.storage.writeCanvas(
            vaultId, resource.resourceId, replaceCanvasScene(resource.content),
          )
        } else if (resource.resourceType === 'mindmap') {
          await this.storage.writeMindMap(
            vaultId, resource.resourceId, replaceMindMapData(resource.content),
          )
        } else {
          const input = this.normalizeAssetImport(
            resource.mimeType, resource.bytes, resource.fileName,
          )
          const created = await this.storage.writeAsset(
            vaultId, resource.resourceId, input.fileName, input.mimeType, input.bytes,
          )
          const { bytes: _bytes, ...metadata } = created
          asset = metadata
        }
        resourceCreated = true
        this.resourceLocators.delete(vaultId)
        await this.validateDocumentReferences(vaultId, documentId, normalized)
        await this.storage.writeDocument(vaultId, documentId, normalized)
        documentWritten = true
        await this.storage.writeTree(vaultId, {
          ...tree,
          entries: tree.entries.map((candidate) => candidate.id === documentId ? updatedEntry : candidate),
        })
        treeWritten = true
      } catch (error) {
        if (treeWritten) await this.storage.writeTree(vaultId, tree).catch(() => undefined)
        if (documentWritten) {
          await this.storage.writeDocument(vaultId, documentId, previousDocument).catch(() => undefined)
        }
        if (resourceCreated) {
          if (resource.resourceType === 'canvas') {
            await this.storage.deleteCanvas(vaultId, resource.resourceId).catch(() => undefined)
          } else if (resource.resourceType === 'mindmap') {
            await this.storage.deleteMindMap(vaultId, resource.resourceId).catch(() => undefined)
          } else {
            await this.storage.deleteAsset(vaultId, resource.resourceId).catch(() => undefined)
          }
        }
        this.resourceLocators.delete(vaultId)
        throw error
      }

      this.resourceLocators.delete(vaultId)
      this.event(vaultId, resource.resourceType, resource.resourceId, 'created', origin)
      this.event(vaultId, 'document', documentId, 'updated', origin)
      return {
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        document: await this.getDocument(vaultId, documentId),
        ...(asset ? { asset } : {}),
      }
    })
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
      const updatedEntry: ContentEntryV3 = {
        ...entry,
        ...(patch.title === undefined ? {} : { title: normalizeName(patch.title, '内容标题') }),
        updatedAt: new Date().toISOString(),
      }
      const nextTree: VaultTreeV3 = {
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
        await this.storage.writeTree(vaultId, nextTree)
      } catch (error) {
        if (normalized && previousDocument) {
          await this.storage.writeDocument(vaultId, documentId, previousDocument).catch(() => undefined)
        }
        await this.storage.writeTree(vaultId, tree).catch(() => undefined)
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

  async getCanvas(vaultId: string, canvasId: string): Promise<ExcalidrawScene | LoadedCanvas> {
    await this.locateCanvas(vaultId, canvasId)
    const tree = await this.storage.readTree(vaultId)
    const entry = tree.entries.find((candidate) => candidate.id === canvasId)
    const content = await this.storage.readCanvas(vaultId, canvasId)
    if (!entry) return content
    if (entry.kind !== 'content' || entry.contentType !== 'canvas') {
      throw new KnowledgeError('CONFLICT', '画布 ID 与其他树条目冲突')
    }
    return { ...await this.storage.contentSummary(vaultId, entry), contentType: 'canvas', content }
  }

  async createCanvas(
    vaultId: string,
    value: ExcalidrawScene,
    origin: MutationOrigin = 'renderer',
  ): Promise<{ id: string; content: ExcalidrawScene }> {
    return this.mutate(vaultId, 'canvas.create', undefined, async () => {
      await this.storage.readVault(vaultId)
      const id = uuidv4()
      const content = replaceCanvasScene(value)
      await this.storage.writeCanvas(vaultId, id, content)
      this.event(vaultId, 'canvas', id, 'created', origin)
      return { id, content }
    })
  }

  private async mutateCanvas(
    vaultId: string,
    canvasId: string,
    origin: MutationOrigin,
    operation: string,
    edit: (value: ExcalidrawScene) => ExcalidrawScene,
  ): Promise<ExcalidrawScene> {
    return this.mutate(vaultId, operation, canvasId, async () => {
      await this.locateCanvas(vaultId, canvasId)
      const value = await this.storage.readCanvas(vaultId, canvasId)
      const updated = edit(value)
      assertExcalidrawScene(updated)
      const tree = await this.storage.readTree(vaultId)
      const entry = tree.entries.find((candidate): candidate is ContentEntryV3 => (
        candidate.kind === 'content' && candidate.contentType === 'canvas' && candidate.id === canvasId
      ))
      try {
        await this.storage.writeCanvas(vaultId, canvasId, updated)
        if (entry) await this.storage.writeTree(vaultId, {
          ...tree,
          entries: tree.entries.map((candidate) => candidate.id === canvasId
            ? { ...entry, updatedAt: new Date().toISOString() }
            : candidate),
        })
      } catch (error) {
        await this.storage.writeCanvas(vaultId, canvasId, value).catch(() => undefined)
        throw error
      }
      this.event(vaultId, 'canvas', canvasId, 'updated', origin)
      return updated
    })
  }

  replaceCanvas(vaultId: string, canvasId: string, value: ExcalidrawScene, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.replace', () => replaceCanvasScene(value))
  }

  upsertCanvasElements(vaultId: string, canvasId: string, elements: ExcalidrawElement[], origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.elements.upsert', (value) => upsertCanvasElements(value, elements))
  }

  patchCanvasElements(vaultId: string, canvasId: string, patches: CanvasElementPatch[], origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.elements.patch', (value) => patchCanvasElements(value, patches))
  }

  deleteCanvasElements(vaultId: string, canvasId: string, elementIds: string[], origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.elements.delete', (value) => deleteCanvasElements(value, elementIds))
  }

  reorderCanvasElements(vaultId: string, canvasId: string, orderedIds: string[], origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.elements.reorder', (value) => reorderCanvasElements(value, orderedIds))
  }

  upsertCanvasFiles(vaultId: string, canvasId: string, files: Record<string, JsonObject>, origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.files.upsert', (value) => upsertCanvasFiles(value, files))
  }

  deleteCanvasFiles(vaultId: string, canvasId: string, fileIds: string[], origin: MutationOrigin = 'renderer'): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.files.delete', (value) => deleteCanvasFiles(value, fileIds))
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
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.elements.insert',
      (value) => insertCanvasElements(value, elements, files, placement))
  }

  updateCanvas(
    vaultId: string,
    canvasId: string,
    update: CanvasUpdate,
    origin: MutationOrigin = 'renderer',
  ): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.update',
      (value) => updateCanvasScene(value, update))
  }

  deleteCanvasElementBatch(
    vaultId: string,
    canvasId: string,
    elementIds: string[],
    removeUnreferencedFiles = false,
    origin: MutationOrigin = 'renderer',
  ): Promise<ExcalidrawScene> {
    return this.mutateCanvas(vaultId, canvasId, origin, 'canvas.elements.delete-strict',
      (value) => deleteCanvasElementsStrict(value, elementIds, removeUnreferencedFiles))
  }

  async removeCanvas(vaultId: string, canvasId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.removeResource(vaultId, 'canvas', canvasId, origin)
  }

  async createMindMap(vaultId: string, value: MindMapData, origin: MutationOrigin = 'renderer'): Promise<{ id: string; content: MindMapData }> {
    return this.mutate(vaultId, 'mindmap.create', undefined, async () => {
      await this.storage.readVault(vaultId)
      const id = uuidv4()
      const content = replaceMindMapData(value)
      await this.storage.writeMindMap(vaultId, id, content)
      this.event(vaultId, 'mindmap', id, 'created', origin)
      return { id, content }
    })
  }

  getMindMap(vaultId: string, mindMapId: string): Promise<MindMapData> {
    return this.storage.readMindMap(vaultId, mindMapId)
  }

  private async mutateMindMap(vaultId: string, mindMapId: string, origin: MutationOrigin, operation: string, edit: (value: MindMapData) => MindMapData): Promise<MindMapData> {
    return this.mutate(vaultId, operation, mindMapId, async () => {
      await this.locateMindMap(vaultId, mindMapId)
      const value = await this.storage.readMindMap(vaultId, mindMapId)
      const updated = edit(value)
      assertMindMapData(updated)
      const tree = await this.storage.readTree(vaultId)
      const entry = tree.entries.find((candidate): candidate is ContentEntryV3 => (
        candidate.kind === 'content' && candidate.contentType === 'mindmap' && candidate.id === mindMapId
      ))
      try {
        await this.storage.writeMindMap(vaultId, mindMapId, updated)
        if (entry) await this.storage.writeTree(vaultId, {
          ...tree,
          entries: tree.entries.map((candidate) => candidate.id === mindMapId
            ? { ...entry, updatedAt: new Date().toISOString() }
            : candidate),
        })
      } catch (error) {
        await this.storage.writeMindMap(vaultId, mindMapId, value).catch(() => undefined)
        throw error
      }
      this.event(vaultId, 'mindmap', mindMapId, 'updated', origin)
      return updated
    })
  }

  replaceMindMap(vaultId: string, mindMapId: string, value: MindMapData, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, mindMapId, origin, 'mindmap.replace', () => replaceMindMapData(value))
  }

  insertMindMapNode(vaultId: string, mindMapId: string, parentId: string, index: number | undefined, node: MindMapNodeData, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, mindMapId, origin, 'mindmap.node.insert', (value) => insertMindMapNode(value, parentId, index, node))
  }

  patchMindMapNode(vaultId: string, mindMapId: string, patch: MindMapNodePatch, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, mindMapId, origin, 'mindmap.node.patch', (value) => patchMindMapNode(value, patch))
  }

  moveMindMapNode(vaultId: string, mindMapId: string, nodeId: string, parentId: string, index: number | undefined, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, mindMapId, origin, 'mindmap.node.move', (value) => moveMindMapNode(value, nodeId, parentId, index))
  }

  deleteMindMapNode(vaultId: string, mindMapId: string, nodeId: string, origin: MutationOrigin = 'renderer'): Promise<MindMapData> {
    return this.mutateMindMap(vaultId, mindMapId, origin, 'mindmap.node.delete', (value) => deleteMindMapNode(value, nodeId))
  }

  async deleteMindMap(vaultId: string, mindMapId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.removeResource(vaultId, 'mindmap', mindMapId, origin)
  }

  async getMindMapById(vaultId: string, mindMapId: string): Promise<MindMapData> {
    await this.locateMindMap(vaultId, mindMapId)
    return this.storage.readMindMap(vaultId, mindMapId)
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
    return this.mutateMindMap(vaultId, mindMapId, origin, operation, edit)
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
    return this.deleteMindMap(vaultId, mindMapId, origin)
  }

  async importAsset(
    vaultId: string,
    mimeType: string,
    bytes: Uint8Array,
    origin: MutationOrigin = 'renderer',
    fileName?: string,
  ): Promise<AssetData> {
    return this.mutate(vaultId, 'asset.import', undefined, async () => {
      await this.storage.readVault(vaultId)
      const input = this.normalizeAssetImport(mimeType, bytes, fileName)
      const id = uuidv4()
      const result = await this.storage.writeAsset(
        vaultId, id, input.fileName, input.mimeType, input.bytes,
      )
      this.event(vaultId, 'asset', id, 'created', origin)
      return result
    })
  }

  private normalizeAssetImport(
    mimeType: string,
    bytes: Uint8Array,
    fileName?: string,
  ): { mimeType: string; bytes: Uint8Array; fileName: string } {
    const normalizedMimeType = mimeType.trim().toLowerCase()
    if (
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalizedMimeType) ||
      normalizedMimeType.length > 255 || !(bytes instanceof Uint8Array) || bytes.byteLength === 0
    ) throw new KnowledgeError('INVALID_INPUT', '附件类型或内容无效')
    if (fileName !== undefined) {
      if (fileName.length > 255) throw new KnowledgeError('INVALID_INPUT', '附件文件名过长')
      assertPathSegment(fileName, '附件文件名')
    }
    const suppliedExtension = fileName?.match(/\.([A-Za-z0-9]{1,16})$/)?.[1].toLowerCase()
    const extension = MIME_EXTENSIONS[normalizedMimeType] ?? suppliedExtension ?? 'bin'
    return { mimeType: normalizedMimeType, bytes, fileName: fileName ?? `附件.${extension}` }
  }

  async getAssetPath(vaultId: string, assetId: string): Promise<string> {
    const asset = await this.storage.readAsset(vaultId, assetId)
    return this.storage.paths.assetFile(vaultId, assetId, asset.extension)
  }

  async readAsset(vaultId: string, assetId: string): Promise<AssetData> {
    return this.storage.readAsset(vaultId, assetId)
  }

  async getAssetMetadata(vaultId: string, assetId: string): Promise<AssetMetadata> {
    return this.storage.readAssetMetadata(vaultId, assetId)
  }

  async deleteAsset(vaultId: string, assetId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.removeResource(vaultId, 'asset', assetId, origin)
  }

  async readAssetById(vaultId: string, assetId: string): Promise<AssetData> {
    await this.locateAsset(vaultId, assetId)
    return this.readAsset(vaultId, assetId)
  }

  async removeAsset(vaultId: string, assetId: string, origin: MutationOrigin = 'renderer'): Promise<void> {
    return this.deleteAsset(vaultId, assetId, origin)
  }

  private async removeResource(
    vaultId: string,
    type: 'canvas' | 'mindmap' | 'asset',
    resourceId: string,
    origin: MutationOrigin,
  ): Promise<void> {
    return this.mutate(vaultId, `${type}.delete`, resourceId, async () => {
      const tree = await this.storage.readTree(vaultId)
      if (tree.entries.some((entry) => entry.kind === 'content' && entry.id === resourceId)) {
        throw new KnowledgeError('CONFLICT', '资源仍在文档树中，不能直接删除')
      }
      const references = await this.findResourceReferences(vaultId, type, resourceId)
      if (references.length > 0) {
        throw new KnowledgeError('CONFLICT', `资源仍被 ${references.length} 处引用，不能删除`, references)
      }
      if (type === 'canvas') await this.storage.deleteCanvas(vaultId, resourceId)
      else if (type === 'mindmap') await this.storage.deleteMindMap(vaultId, resourceId)
      else await this.storage.deleteAsset(vaultId, resourceId)
      this.event(vaultId, type, resourceId, 'deleted', origin)
    })
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
