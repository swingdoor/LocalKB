import * as path from 'path'
import { promises as fs } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type {
  ContentEntryV2,
  ContentSummary,
  ContentType,
  DocumentReference,
  ExcalidrawScene,
  GroupEntryV2,
  JsonValue,
  MindMapData,
  TipTapDocument,
  TreeEntryV2,
  VaultResourceLocator,
  VaultTreeV2,
  VaultV2,
} from '../../shared/knowledge-types'
import { collectDocumentReferences } from '../../shared/knowledge-operations'
import {
  assertExcalidrawScene,
  assertJsonObject,
  assertMindMapData,
  assertPathSegment,
  assertTipTapDocument,
  assertUuid,
  cloneJson,
  isJsonValue,
  isPlainObject,
  KnowledgeValidationError,
  normalizeName,
  normalizeExcalidrawSceneStructure,
  normalizeTipTapDocumentStructure,
} from '../../shared/knowledge-validation'

export interface FileSystemApi {
  access(path: string): Promise<void>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<unknown[]>
  readFile(path: string, encoding?: BufferEncoding): Promise<Buffer | string>
  writeFile(path: string, data: string | Uint8Array, options?: object): Promise<void>
  open(path: string, flags: string): Promise<{
    writeFile(data: string): Promise<void>
    sync(): Promise<void>
    close(): Promise<void>
  }>
  rename(oldPath: string, newPath: string): Promise<void>
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  stat(path: string): Promise<{ mtime: Date; size: number; isDirectory(): boolean }>
  utimes(path: string, atime: string | number | Date, mtime: string | number | Date): Promise<void>
}

const nodeFs = fs as unknown as FileSystemApi

function persistenceError(action: string, error: unknown): KnowledgeValidationError {
  if (error instanceof KnowledgeValidationError) return error
  const code = isPlainObject(error) && typeof error.code === 'string' ? error.code : undefined
  if (code === 'ENOENT') return new KnowledgeValidationError('NOT_FOUND', `${action}的目标不存在`)
  if (code === 'EEXIST') return new KnowledgeValidationError('CONFLICT', `${action}的目标已存在`)
  return new KnowledgeValidationError('PERSISTENCE_ERROR', `${action}失败`)
}

function parseIso(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new KnowledgeValidationError('CORRUPT_DATA', `${label}无效`)
  }
  return value
}

export function isPathInside(
  root: string,
  candidate: string,
  pathApi: path.PlatformPath = path,
): boolean {
  const relative = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
}

export function resolveInside(
  root: string,
  ...segments: string[]
): string {
  segments.forEach((segment) => assertPathSegment(segment))
  const candidate = path.resolve(root, ...segments)
  if (!isPathInside(root, candidate)) {
    throw new KnowledgeValidationError('PATH_OUTSIDE_VAULT', '路径超出数据目录')
  }
  return candidate
}

export class KnowledgePaths {
  readonly dataRoot: string
  readonly vaultsRoot: string
  readonly stagingRoot: string
  readonly backupsRoot: string

  constructor(dataRoot: string) {
    this.dataRoot = path.resolve(dataRoot)
    this.vaultsRoot = path.join(this.dataRoot, 'vaults')
    this.stagingRoot = path.join(this.dataRoot, '.staging')
    this.backupsRoot = path.join(this.dataRoot, '.backups')
  }

  vault(vaultId: string): string {
    assertUuid(vaultId, '知识库 ID')
    return resolveInside(this.vaultsRoot, vaultId)
  }

  vaultMeta(vaultId: string): string {
    return resolveInside(this.vault(vaultId), 'vault.json')
  }

  legacyMeta(vaultId: string): string {
    return resolveInside(this.vault(vaultId), 'meta.json')
  }

  tree(vaultId: string): string {
    return resolveInside(this.vault(vaultId), 'tree.json')
  }

  documents(vaultId: string): string {
    return resolveInside(this.vault(vaultId), 'documents')
  }

  document(vaultId: string, documentId: string): string {
    assertUuid(documentId, '文档 ID')
    return resolveInside(this.documents(vaultId), documentId)
  }

  documentFile(vaultId: string, documentId: string): string {
    return resolveInside(this.document(vaultId, documentId), 'document.json')
  }

  canvases(vaultId: string): string {
    return resolveInside(this.vault(vaultId), 'canvases')
  }

  canvasFile(vaultId: string, canvasId: string): string {
    assertUuid(canvasId, '画布 ID')
    return resolveInside(this.canvases(vaultId), `${canvasId}.json`)
  }

  embeddedCanvases(vaultId: string, documentId: string): string {
    return resolveInside(this.document(vaultId, documentId), 'canvases')
  }

  embeddedCanvasFile(vaultId: string, documentId: string, canvasId: string): string {
    assertUuid(canvasId, '画布 ID')
    return resolveInside(this.embeddedCanvases(vaultId, documentId), `${canvasId}.json`)
  }

  mindMaps(vaultId: string, documentId: string): string {
    return resolveInside(this.document(vaultId, documentId), 'mindmaps')
  }

  mindMapFile(vaultId: string, documentId: string, mindMapId: string): string {
    assertUuid(mindMapId, '思维导图 ID')
    return resolveInside(this.mindMaps(vaultId, documentId), `${mindMapId}.json`)
  }

  assets(vaultId: string, documentId: string): string {
    return resolveInside(this.document(vaultId, documentId), 'assets')
  }

  resourceTrash(vaultId: string, documentId: string): string {
    return resolveInside(this.document(vaultId, documentId), '.operations', 'resource-trash')
  }

  assetFile(vaultId: string, documentId: string, assetId: string, extension: string): string {
    assertUuid(assetId, '资源 ID')
    assertPathSegment(extension, '资源扩展名')
    if (!/^[a-z0-9]+$/i.test(extension)) {
      throw new KnowledgeValidationError('INVALID_INPUT', '资源扩展名无效')
    }
    return resolveInside(this.assets(vaultId, documentId), `${assetId}.${extension.toLowerCase()}`)
  }

  operationRoot(vaultId: string, state: 'staging' | 'trash'): string {
    return resolveInside(this.vault(vaultId), '.operations', state)
  }

  operationItem(
    vaultId: string,
    state: 'staging' | 'trash',
    contentType: ContentType,
    contentId: string,
  ): string {
    assertUuid(contentId, '内容 ID')
    return resolveInside(this.operationRoot(vaultId, state), `${contentType}-${contentId}`)
  }

  migrationStage(vaultId: string): string {
    assertUuid(vaultId, '知识库 ID')
    return resolveInside(this.stagingRoot, 'vaults', vaultId)
  }

  migrationMarker(vaultId: string): string {
    return resolveInside(this.migrationStage(vaultId), '.migration-complete.json')
  }

  backup(vaultId: string, suffix: string): string {
    assertUuid(vaultId, '知识库 ID')
    assertPathSegment(suffix, '备份后缀')
    return resolveInside(this.backupsRoot, `${vaultId}-v1-${suffix}`)
  }

  activeContent(vaultId: string, contentType: ContentType, contentId: string): string {
    return contentType === 'document'
      ? this.document(vaultId, contentId)
      : this.canvasFile(vaultId, contentId)
  }
}

function entryParent(value: unknown): string | null {
  if (value === null) return null
  assertUuid(value, '父级 ID')
  return value
}

export function validateAndNormalizeTree(value: unknown): VaultTreeV2 {
  assertJsonObject(value, '知识库树')
  if (value.schemaVersion !== 2 || !Array.isArray(value.entries)) {
    if (typeof value.schemaVersion === 'number' && value.schemaVersion !== 2) {
      throw new KnowledgeValidationError('UNSUPPORTED_VERSION', '不支持的知识库树版本')
    }
    throw new KnowledgeValidationError('CORRUPT_DATA', '知识库树结构无效')
  }

  const entries: TreeEntryV2[] = value.entries.map((raw, sourceIndex) => {
    assertJsonObject(raw, `知识库树条目 ${sourceIndex}`)
    assertUuid(raw.id, '树条目 ID')
    const parentId = entryParent(raw.parentId)
    if (!Number.isInteger(raw.order) || Number(raw.order) < 0) {
      throw new KnowledgeValidationError('CORRUPT_DATA', '树条目顺序无效')
    }
    if (raw.kind === 'group') {
      return {
        ...cloneJson(raw),
        kind: 'group',
        id: raw.id,
        name: normalizeName(raw.name, '分组名称'),
        parentId,
        order: Number(raw.order),
      } as GroupEntryV2
    }
    if (raw.kind === 'content' && (raw.contentType === 'document' || raw.contentType === 'canvas')) {
      return {
        ...cloneJson(raw),
        kind: 'content',
        id: raw.id,
        contentType: raw.contentType,
        title: normalizeName(raw.title, '内容标题'),
        parentId,
        order: Number(raw.order),
        createdAt: parseIso(raw.createdAt, '创建时间'),
        metadataUpdatedAt: parseIso(raw.metadataUpdatedAt, '元数据更新时间'),
      } as ContentEntryV2
    }
    throw new KnowledgeValidationError('CORRUPT_DATA', '未知的知识库树条目')
  })

  const byId = new Map<string, TreeEntryV2>()
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      throw new KnowledgeValidationError('CONFLICT', `树条目 ID 重复: ${entry.id}`)
    }
    byId.set(entry.id, entry)
  }
  for (const entry of entries) {
    if (entry.parentId !== null) {
      const parent = byId.get(entry.parentId)
      if (!parent || parent.kind !== 'group') {
        throw new KnowledgeValidationError('CORRUPT_DATA', '树条目父级不存在或不是分组')
      }
    }
    const visited = new Set<string>([entry.id])
    let parentId = entry.parentId
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new KnowledgeValidationError('CONFLICT', '知识库树存在分组循环')
      }
      visited.add(parentId)
      parentId = byId.get(parentId)?.parentId ?? null
    }
  }

  const siblings = new Map<string, Array<{ entry: TreeEntryV2; sourceIndex: number }>>()
  entries.forEach((entry, sourceIndex) => {
    const key = entry.parentId ?? '__root__'
    const list = siblings.get(key) ?? []
    list.push({ entry, sourceIndex })
    siblings.set(key, list)
  })
  for (const list of siblings.values()) {
    list.sort((a, b) => a.entry.order - b.entry.order || a.sourceIndex - b.sourceIndex)
      .forEach(({ entry }, order) => { entry.order = order })
  }
  return { schemaVersion: 2, entries }
}

export class FileKnowledgeStore {
  readonly paths: KnowledgePaths

  constructor(
    dataRoot: string,
    private readonly fileSystem: FileSystemApi = nodeFs,
  ) {
    this.paths = new KnowledgePaths(dataRoot)
  }

  async exists(target: string): Promise<boolean> {
    try {
      await this.fileSystem.access(target)
      return true
    } catch {
      return false
    }
  }

  async ensureLayout(): Promise<void> {
    await Promise.all([
      this.fileSystem.mkdir(this.paths.vaultsRoot, { recursive: true }),
      this.fileSystem.mkdir(this.paths.stagingRoot, { recursive: true }),
      this.fileSystem.mkdir(this.paths.backupsRoot, { recursive: true }),
    ])
  }

  async readJson<T extends JsonValue>(target: string, label: string): Promise<T> {
    try {
      const raw = await this.fileSystem.readFile(target, 'utf8')
      const value: unknown = JSON.parse(String(raw))
      if (!isJsonValue(value)) throw new KnowledgeValidationError('CORRUPT_DATA', `${label}不是有效 JSON`)
      return value as T
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new KnowledgeValidationError('CORRUPT_DATA', `${label}无法解析`)
      }
      throw persistenceError(`读取${label}`, error)
    }
  }

  async atomicWriteJson(target: string, value: JsonValue): Promise<void> {
    if (!isJsonValue(value)) {
      throw new KnowledgeValidationError('INVALID_INPUT', '写入值不是有效 JSON')
    }
    let serialized: string
    try {
      serialized = `${JSON.stringify(value, null, 2)}\n`
    } catch (error) {
      throw persistenceError('序列化 JSON', error)
    }
    const directory = path.dirname(target)
    const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${uuidv4()}.tmp`)
    let handle: Awaited<ReturnType<FileSystemApi['open']>> | null = null
    try {
      await this.fileSystem.mkdir(directory, { recursive: true })
      handle = await this.fileSystem.open(temporary, 'wx')
      await handle.writeFile(serialized)
      await handle.sync()
      await handle.close()
      handle = null
      await this.fileSystem.rename(temporary, target)
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined)
      await this.fileSystem.rm(temporary, { force: true }).catch(() => undefined)
      throw persistenceError('原子写入 JSON', error)
    }
  }

  async readVault(vaultId: string): Promise<VaultV2> {
    const raw = await this.readJson<JsonValue>(this.paths.vaultMeta(vaultId), '知识库元数据')
    assertJsonObject(raw, '知识库元数据')
    if (raw.schemaVersion !== 2) {
      throw new KnowledgeValidationError('UNSUPPORTED_VERSION', '不支持的知识库版本')
    }
    assertUuid(raw.id, '知识库 ID')
    if (raw.id !== vaultId) throw new KnowledgeValidationError('CORRUPT_DATA', '知识库 ID 不一致')
    return {
      schemaVersion: 2,
      id: raw.id,
      name: normalizeName(raw.name, '知识库名称'),
      createdAt: parseIso(raw.createdAt, '知识库创建时间'),
    }
  }

  async writeVault(value: VaultV2): Promise<void> {
    assertUuid(value.id, '知识库 ID')
    const normalized: VaultV2 = {
      schemaVersion: 2,
      id: value.id,
      name: normalizeName(value.name, '知识库名称'),
      createdAt: parseIso(value.createdAt, '知识库创建时间'),
    }
    await this.atomicWriteJson(this.paths.vaultMeta(value.id), normalized as unknown as JsonValue)
  }

  async removeVault(vaultId: string): Promise<void> {
    try {
      await this.fileSystem.rm(this.paths.vault(vaultId), { recursive: true, force: false })
    } catch (error) {
      throw persistenceError('删除知识库', error)
    }
  }

  async listVaults(): Promise<VaultV2[]> {
    await this.ensureLayout()
    const entries = await this.fileSystem.readdir(this.paths.vaultsRoot, { withFileTypes: true }) as Array<{
      name: string
      isDirectory(): boolean
    }>
    const vaults: VaultV2[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        assertUuid(entry.name, '知识库 ID')
        vaults.push(await this.readVault(entry.name))
      } catch (error) {
        if (!(error instanceof KnowledgeValidationError) || error.code !== 'UNSUPPORTED_VERSION') {
          continue
        }
      }
    }
    return vaults.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  async listVaultDirectoryIds(): Promise<string[]> {
    await this.ensureLayout()
    const entries = await this.fileSystem.readdir(this.paths.vaultsRoot, { withFileTypes: true }) as Array<{
      name: string
      isDirectory(): boolean
    }>
    return entries.flatMap((entry) => {
      if (!entry.isDirectory()) return []
      try { assertUuid(entry.name, '知识库 ID'); return [entry.name] } catch { return [] }
    })
  }

  async readTree(vaultId: string): Promise<VaultTreeV2> {
    return validateAndNormalizeTree(
      await this.readJson<JsonValue>(this.paths.tree(vaultId), '知识库树'),
    )
  }

  async writeTree(vaultId: string, tree: VaultTreeV2): Promise<VaultTreeV2> {
    const normalized = validateAndNormalizeTree(tree as unknown)
    await this.atomicWriteJson(this.paths.tree(vaultId), normalized as unknown as JsonValue)
    return normalized
  }

  async nativeContentMtime(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<string> {
    const target = contentType === 'document'
      ? this.paths.documentFile(vaultId, contentId)
      : this.paths.canvasFile(vaultId, contentId)
    try {
      return (await this.fileSystem.stat(target)).mtime.toISOString()
    } catch (error) {
      throw persistenceError('读取内容修改时间', error)
    }
  }

  async contentSummary(vaultId: string, entry: ContentEntryV2): Promise<ContentSummary> {
    const contentUpdatedAt = await this.nativeContentMtime(vaultId, entry.contentType, entry.id)
    return {
      id: entry.id,
      contentType: entry.contentType,
      title: entry.title,
      parentId: entry.parentId,
      order: entry.order,
      createdAt: entry.createdAt,
      updatedAt: Date.parse(contentUpdatedAt) > Date.parse(entry.metadataUpdatedAt)
        ? contentUpdatedAt
        : entry.metadataUpdatedAt,
    }
  }

  async listContentSummaries(vaultId: string): Promise<ContentSummary[]> {
    const tree = await this.readTree(vaultId)
    return Promise.all(tree.entries.filter(
      (entry): entry is ContentEntryV2 => entry.kind === 'content',
    ).map((entry) => this.contentSummary(vaultId, entry)))
  }

  async scanResourceLocator(vaultId: string): Promise<VaultResourceLocator> {
    const tree = await this.readTree(vaultId)
    const locator: VaultResourceLocator = {
      canvases: new Map(),
      mindMaps: new Map(),
      assets: new Map(),
    }
    const add = <T>(target: Map<string, T>, id: string, location: T, label: string): void => {
      assertUuid(id, `${label} ID`)
      if (target.has(id)) throw new KnowledgeValidationError('CONFLICT', `${label} ID 重复: ${id}`)
      target.set(id, location)
    }
    for (const entry of tree.entries) {
      if (entry.kind === 'content' && entry.contentType === 'canvas') {
        add(locator.canvases, entry.id, { scope: 'top-level' }, '画布')
      }
    }
    const readNames = async (directory: string): Promise<string[]> => {
      try {
        return await this.fileSystem.readdir(directory) as string[]
      } catch (error) {
        const code = isPlainObject(error) && error.code === 'ENOENT'
        if (code) return []
        throw persistenceError('读取资源目录', error)
      }
    }
    const documents = tree.entries.filter(
      (entry): entry is ContentEntryV2 => entry.kind === 'content' && entry.contentType === 'document',
    )
    for (const document of documents) {
      for (const name of await readNames(this.paths.embeddedCanvases(vaultId, document.id))) {
        const match = /^([0-9a-f-]{36})\.json$/i.exec(name)
        if (match) add(locator.canvases, match[1], { scope: 'embedded', documentId: document.id }, '画布')
      }
      for (const name of await readNames(this.paths.mindMaps(vaultId, document.id))) {
        const match = /^([0-9a-f-]{36})\.json$/i.exec(name)
        if (match) add(locator.mindMaps, match[1], { documentId: document.id }, '思维导图')
      }
      for (const name of await readNames(this.paths.assets(vaultId, document.id))) {
        const match = /^([0-9a-f-]{36})\.[a-z0-9]+$/i.exec(name)
        if (match) add(locator.assets, match[1], { documentId: document.id }, '附件')
      }
    }
    return locator
  }

  async readDocument(vaultId: string, documentId: string): Promise<TipTapDocument> {
    const value = await this.readJson<JsonValue>(this.paths.documentFile(vaultId, documentId), '文档')
    return normalizeTipTapDocumentStructure(value)
  }

  async writeDocument(vaultId: string, documentId: string, value: TipTapDocument): Promise<void> {
    assertTipTapDocument(value)
    await this.atomicWriteJson(
      this.paths.documentFile(vaultId, documentId), value as unknown as JsonValue,
    )
  }

  async readCanvas(
    vaultId: string,
    canvasId: string,
    documentId?: string,
  ): Promise<ExcalidrawScene> {
    const target = documentId
      ? this.paths.embeddedCanvasFile(vaultId, documentId, canvasId)
      : this.paths.canvasFile(vaultId, canvasId)
    const value = await this.readJson<JsonValue>(target, '画布')
    return normalizeExcalidrawSceneStructure(value)
  }

  async writeCanvas(
    vaultId: string,
    canvasId: string,
    value: ExcalidrawScene,
    documentId?: string,
  ): Promise<void> {
    assertExcalidrawScene(value)
    const target = documentId
      ? this.paths.embeddedCanvasFile(vaultId, documentId, canvasId)
      : this.paths.canvasFile(vaultId, canvasId)
    await this.atomicWriteJson(target, value as unknown as JsonValue)
  }

  async readMindMap(vaultId: string, documentId: string, mindMapId: string): Promise<MindMapData> {
    const value = await this.readJson<JsonValue>(
      this.paths.mindMapFile(vaultId, documentId, mindMapId), '思维导图',
    )
    assertMindMapData(value)
    return value
  }

  async writeMindMap(
    vaultId: string,
    documentId: string,
    mindMapId: string,
    value: MindMapData,
  ): Promise<void> {
    assertMindMapData(value)
    await this.atomicWriteJson(
      this.paths.mindMapFile(vaultId, documentId, mindMapId), value as unknown as JsonValue,
    )
  }

  async deleteCanvas(vaultId: string, canvasId: string, documentId?: string): Promise<void> {
    const target = documentId
      ? this.paths.embeddedCanvasFile(vaultId, documentId, canvasId)
      : this.paths.canvasFile(vaultId, canvasId)
    try {
      await this.fileSystem.rm(target)
    } catch (error) {
      throw persistenceError('删除画布', error)
    }
  }

  async deleteMindMap(vaultId: string, documentId: string, mindMapId: string): Promise<void> {
    try {
      await this.fileSystem.rm(this.paths.mindMapFile(vaultId, documentId, mindMapId))
    } catch (error) {
      throw persistenceError('删除思维导图', error)
    }
  }

  async writeAsset(
    vaultId: string,
    documentId: string,
    assetId: string,
    extension: string,
    bytes: Uint8Array,
  ): Promise<string> {
    const target = this.paths.assetFile(vaultId, documentId, assetId, extension)
    try {
      await this.fileSystem.mkdir(path.dirname(target), { recursive: true })
      await this.fileSystem.writeFile(target, bytes)
      return target
    } catch (error) {
      throw persistenceError('写入资源', error)
    }
  }

  async findAsset(vaultId: string, documentId: string, assetId: string): Promise<string> {
    assertUuid(assetId, '资源 ID')
    const directory = this.paths.assets(vaultId, documentId)
    let names: unknown[]
    try {
      names = await this.fileSystem.readdir(directory)
    } catch (error) {
      throw persistenceError('读取资源目录', error)
    }
    const matches = (names as string[]).filter((name) => name.startsWith(`${assetId}.`))
    if (matches.length !== 1) {
      throw new KnowledgeValidationError(
        matches.length === 0 ? 'NOT_FOUND' : 'CORRUPT_DATA', '资源不存在或不唯一',
      )
    }
    return resolveInside(directory, matches[0])
  }

  async readAsset(vaultId: string, documentId: string, assetId: string): Promise<Uint8Array> {
    const target = await this.findAsset(vaultId, documentId, assetId)
    try {
      return new Uint8Array(await this.fileSystem.readFile(target) as Buffer)
    } catch (error) {
      throw persistenceError('读取资源', error)
    }
  }

  async deleteAsset(vaultId: string, documentId: string, assetId: string): Promise<void> {
    const target = await this.findAsset(vaultId, documentId, assetId)
    try {
      await this.fileSystem.rm(target)
    } catch (error) {
      throw persistenceError('删除资源', error)
    }
  }

  private async resourcePath(
    vaultId: string,
    documentId: string,
    reference: Pick<DocumentReference, 'type' | 'id'>,
  ): Promise<string> {
    if (reference.type === 'canvas') {
      return this.paths.embeddedCanvasFile(vaultId, documentId, reference.id)
    }
    if (reference.type === 'mindmap') {
      return this.paths.mindMapFile(vaultId, documentId, reference.id)
    }
    return this.findAsset(vaultId, documentId, reference.id)
  }

  async stageDocumentResources(
    vaultId: string,
    documentId: string,
    references: Array<Pick<DocumentReference, 'type' | 'id'>>,
  ): Promise<string[]> {
    const staged: string[] = []
    try {
      for (const reference of references) {
        const source = await this.resourcePath(vaultId, documentId, reference)
        const name = `${reference.type}-${path.basename(source)}`
        const target = resolveInside(this.paths.resourceTrash(vaultId, documentId), name)
        await this.movePath(source, target)
        staged.push(name)
      }
      return staged
    } catch (error) {
      await this.restoreDocumentResources(vaultId, documentId, staged).catch(() => undefined)
      throw error
    }
  }

  async restoreDocumentResources(
    vaultId: string,
    documentId: string,
    stagedNames: string[],
  ): Promise<void> {
    for (const name of stagedNames) {
      assertPathSegment(name, '暂存资源名称')
      const match = /^(canvas|mindmap|asset)-(.+)$/.exec(name)
      if (!match) throw new KnowledgeValidationError('CORRUPT_DATA', '暂存资源名称无效')
      const source = resolveInside(this.paths.resourceTrash(vaultId, documentId), name)
      const target = match[1] === 'canvas'
        ? resolveInside(this.paths.embeddedCanvases(vaultId, documentId), match[2])
        : match[1] === 'mindmap'
          ? resolveInside(this.paths.mindMaps(vaultId, documentId), match[2])
          : resolveInside(this.paths.assets(vaultId, documentId), match[2])
      await this.movePath(source, target)
    }
  }

  async purgeDocumentResources(vaultId: string, documentId: string): Promise<void> {
    await this.fileSystem.rm(
      this.paths.resourceTrash(vaultId, documentId), { recursive: true, force: true },
    )
  }

  async setMtime(target: string, timestamp: string): Promise<void> {
    parseIso(timestamp, '修改时间')
    try {
      const date = new Date(timestamp)
      await this.fileSystem.utimes(target, date, date)
    } catch (error) {
      throw persistenceError('设置修改时间', error)
    }
  }

  private async movePath(source: string, target: string): Promise<void> {
    try {
      await this.fileSystem.mkdir(path.dirname(target), { recursive: true })
      await this.fileSystem.rename(source, target)
    } catch (error) {
      throw persistenceError('移动内容', error)
    }
  }

  async stageContentDeletion(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<string> {
    const active = this.paths.activeContent(vaultId, contentType, contentId)
    const trash = this.paths.operationItem(vaultId, 'trash', contentType, contentId)
    await this.movePath(active, trash)
    return trash
  }

  async restoreContentDeletion(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    await this.movePath(
      this.paths.operationItem(vaultId, 'trash', contentType, contentId),
      this.paths.activeContent(vaultId, contentType, contentId),
    )
  }

  async purgeContentDeletion(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    await this.fileSystem.rm(
      this.paths.operationItem(vaultId, 'trash', contentType, contentId),
      { recursive: true, force: true },
    )
  }

  async stageNewDocument(
    vaultId: string,
    documentId: string,
    value: TipTapDocument,
  ): Promise<string> {
    assertTipTapDocument(value)
    const stage = this.paths.operationItem(vaultId, 'staging', 'document', documentId)
    await this.atomicWriteJson(
      resolveInside(stage, 'document.json'), value as unknown as JsonValue,
    )
    return stage
  }

  async stageNewCanvas(
    vaultId: string,
    canvasId: string,
    value: ExcalidrawScene,
  ): Promise<string> {
    assertExcalidrawScene(value)
    const stage = this.paths.operationItem(vaultId, 'staging', 'canvas', canvasId)
    await this.atomicWriteJson(stage, value as unknown as JsonValue)
    return stage
  }

  async activateStagedContent(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    await this.movePath(
      this.paths.operationItem(vaultId, 'staging', contentType, contentId),
      this.paths.activeContent(vaultId, contentType, contentId),
    )
  }

  async discardStagedContent(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    await this.fileSystem.rm(
      this.paths.operationItem(vaultId, 'staging', contentType, contentId),
      { recursive: true, force: true },
    )
  }

  private parseOperationName(name: string): { contentType: ContentType; contentId: string } | null {
    const match = /^(document|canvas)-([0-9a-f-]{36})$/i.exec(name)
    if (!match) return null
    try {
      assertUuid(match[2], '内容 ID')
      return { contentType: match[1] as ContentType, contentId: match[2] }
    } catch {
      return null
    }
  }

  async reconcileVaultOperations(vaultId: string): Promise<void> {
    const tree = await this.readTree(vaultId)
    const active = new Set(tree.entries.filter(
      (entry): entry is ContentEntryV2 => entry.kind === 'content',
    ).map((entry) => `${entry.contentType}:${entry.id}`))
    for (const state of ['staging', 'trash'] as const) {
      const root = this.paths.operationRoot(vaultId, state)
      if (!(await this.exists(root))) continue
      const names = await this.fileSystem.readdir(root) as string[]
      for (const name of names) {
        const item = this.parseOperationName(name)
        if (!item) continue
        const key = `${item.contentType}:${item.contentId}`
        const target = this.paths.activeContent(vaultId, item.contentType, item.contentId)
        const targetExists = await this.exists(target)
        if (state === 'staging') {
          if (active.has(key) && !targetExists) {
            await this.activateStagedContent(vaultId, item.contentType, item.contentId)
          } else {
            await this.discardStagedContent(vaultId, item.contentType, item.contentId)
          }
        } else if (active.has(key) && !targetExists) {
          await this.restoreContentDeletion(vaultId, item.contentType, item.contentId)
        } else if (!active.has(key)) {
          await this.purgeContentDeletion(vaultId, item.contentType, item.contentId)
        }
      }
    }
    for (const entry of tree.entries) {
      if (entry.kind !== 'content' || entry.contentType !== 'document') continue
      const trash = this.paths.resourceTrash(vaultId, entry.id)
      if (!(await this.exists(trash))) continue
      const document = await this.readDocument(vaultId, entry.id)
      const referenced = new Set(collectDocumentReferences(document).map(
        (reference) => `${reference.type}:${reference.id}`,
      ))
      const names = await this.fileSystem.readdir(trash) as string[]
      const restore = names.filter((name) => {
        const match = /^(canvas|mindmap|asset)-([0-9a-f-]{36})(?:\.[a-z0-9]+)?$/i.exec(name)
        return match ? referenced.has(`${match[1]}:${match[2]}`) : false
      })
      await this.restoreDocumentResources(vaultId, entry.id, restore)
      await this.purgeDocumentResources(vaultId, entry.id)
    }
  }

  async completedMigrationStage(vaultId: string): Promise<boolean> {
    if (!(await this.exists(this.paths.migrationMarker(vaultId)))) return false
    try {
      const marker = await this.readJson<JsonValue>(
        this.paths.migrationMarker(vaultId), '迁移完成标记',
      )
      assertJsonObject(marker, '迁移完成标记')
      return marker.schemaVersion === 2 && marker.vaultId === vaultId
    } catch {
      return false
    }
  }

  async listBackups(vaultId: string): Promise<string[]> {
    await this.ensureLayout()
    const names = await this.fileSystem.readdir(this.paths.backupsRoot) as string[]
    return names.filter((name) => name.startsWith(`${vaultId}-v1-`)).sort().reverse()
      .map((name) => resolveInside(this.paths.backupsRoot, name))
  }

  async reconcileMigration(vaultId: string): Promise<void> {
    const active = this.paths.vault(vaultId)
    const stage = this.paths.migrationStage(vaultId)
    const activeExists = await this.exists(active)
    const stageComplete = await this.completedMigrationStage(vaultId)
    const backups = await this.listBackups(vaultId)
    if (!activeExists && stageComplete) {
      await this.movePath(stage, active)
      await this.fileSystem.rm(
        resolveInside(active, '.migration-complete.json'), { force: true },
      )
      return
    }
    if (!activeExists && backups.length > 0) {
      await this.movePath(backups[0], active)
      return
    }
    if (activeExists && await this.exists(this.paths.vaultMeta(vaultId))) {
      await this.reconcileVaultOperations(vaultId)
    }
  }
}
