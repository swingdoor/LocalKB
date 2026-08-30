import * as path from 'path'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  VAULT_FORMAT_VERSIONS,
} from '../../shared/knowledge-types'
import type {
  AssetData,
  AssetManifest,
  AssetManifestEntry,
  AssetMetadata,
  ContentEntryV3,
  ContentSummary,
  ContentType,
  ExcalidrawScene,
  GroupEntryV3,
  JsonValue,
  MindMapData,
  TipTapDocument,
  TreeEntryV3,
  VaultResourceLocator,
  VaultTreeV3,
  VaultV3,
} from '../../shared/knowledge-types'
import {
  assertAssetManifest,
  assertAssetManifestEntry,
  assertExcalidrawScene,
  assertIsoTimestamp,
  assertJsonObject,
  assertMindMapData,
  assertMimeType,
  assertPathSegment,
  assertTipTapDocument,
  assertUuid,
  cloneJson,
  isJsonValue,
  isPlainObject,
  KnowledgeValidationError,
  normalizeExcalidrawSceneStructure,
  normalizeName,
  normalizeTipTapDocumentStructure,
} from '../../shared/knowledge-validation'
import { atomicCommitFile, type AtomicFileSystem } from '../storage/atomic-file'

export interface FileSystemApi extends AtomicFileSystem {
  access(target: string): Promise<void>
  readdir(target: string, options?: { withFileTypes?: boolean }): Promise<unknown[]>
  readFile(target: string, encoding?: BufferEncoding): Promise<Buffer | string>
  writeFile(target: string, data: string | Uint8Array, options?: object): Promise<void>
  stat(target: string): Promise<{ mtime: Date; size: number; isDirectory(): boolean }>
  utimes(target: string, atime: string | number | Date, mtime: string | number | Date): Promise<void>
}

const nodeFs = fs as unknown as FileSystemApi

function persistenceError(action: string, error: unknown): KnowledgeValidationError {
  if (error instanceof KnowledgeValidationError) return error
  const code = isPlainObject(error) && typeof error.code === 'string' ? error.code : undefined
  if (code === 'ENOENT') return new KnowledgeValidationError('NOT_FOUND', `${action}的目标不存在`)
  if (code === 'EEXIST') return new KnowledgeValidationError('CONFLICT', `${action}的目标已存在`)
  return new KnowledgeValidationError('PERSISTENCE_ERROR', `${action}失败`)
}

export function isPathInside(
  root: string,
  candidate: string,
  pathApi: path.PlatformPath = path,
): boolean {
  const relative = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !pathApi.isAbsolute(relative))
}

export function resolveInside(root: string, ...segments: string[]): string {
  segments.forEach((segment) => assertPathSegment(segment))
  const candidate = path.resolve(root, ...segments)
  if (!isPathInside(root, candidate)) {
    throw new KnowledgeValidationError('PATH_OUTSIDE_VAULT', '路径超出数据目录')
  }
  return candidate
}

function extensionOf(fileName: string): string {
  assertPathSegment(fileName, '附件文件名')
  const extension = path.extname(fileName).slice(1).toLowerCase()
  if (!/^[a-z0-9]{1,16}$/.test(extension)) {
    throw new KnowledgeValidationError('INVALID_INPUT', '附件扩展名无效')
  }
  return extension
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

  vaultMeta(vaultId: string): string { return resolveInside(this.vault(vaultId), 'vault.json') }
  legacyMeta(vaultId: string): string { return resolveInside(this.vault(vaultId), 'meta.json') }
  tree(vaultId: string): string { return resolveInside(this.vault(vaultId), 'tree.json') }
  documents(vaultId: string): string { return resolveInside(this.vault(vaultId), 'documents') }
  canvases(vaultId: string): string { return resolveInside(this.vault(vaultId), 'canvases') }
  mindMaps(vaultId: string): string { return resolveInside(this.vault(vaultId), 'mindmaps') }
  assets(vaultId: string): string { return resolveInside(this.vault(vaultId), 'assets') }
  assetManifest(vaultId: string): string { return resolveInside(this.assets(vaultId), 'manifest.json') }

  documentFile(vaultId: string, documentId: string): string {
    assertUuid(documentId, '文档 ID')
    return resolveInside(this.documents(vaultId), `${documentId}.json`)
  }

  canvasFile(vaultId: string, canvasId: string): string {
    assertUuid(canvasId, '画布 ID')
    return resolveInside(this.canvases(vaultId), `${canvasId}.json`)
  }

  mindMapFile(vaultId: string, mindMapId: string): string {
    assertUuid(mindMapId, '思维导图 ID')
    return resolveInside(this.mindMaps(vaultId), `${mindMapId}.json`)
  }

  assetFile(vaultId: string, assetId: string, extension: string): string {
    assertUuid(assetId, '附件 ID')
    assertPathSegment(extension, '附件扩展名')
    if (!/^[a-z0-9]{1,16}$/i.test(extension)) {
      throw new KnowledgeValidationError('INVALID_INPUT', '附件扩展名无效')
    }
    return resolveInside(this.assets(vaultId), `${assetId}.${extension.toLowerCase()}`)
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
    return resolveInside(this.operationRoot(vaultId, state), `${contentType}-${contentId}.json`)
  }

  assetOperations(vaultId: string): string {
    return resolveInside(this.vault(vaultId), '.operations', 'assets')
  }

  assetOperation(vaultId: string, assetId: string): string {
    assertUuid(assetId, '附件 ID')
    return resolveInside(this.assetOperations(vaultId), assetId)
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
    return resolveInside(this.backupsRoot, `${vaultId}-v2-${suffix}`)
  }

  activeContent(vaultId: string, contentType: ContentType, contentId: string): string {
    if (contentType === 'document') return this.documentFile(vaultId, contentId)
    if (contentType === 'canvas') return this.canvasFile(vaultId, contentId)
    return this.mindMapFile(vaultId, contentId)
  }
}

function entryParent(value: unknown): string | null {
  if (value === null) return null
  assertUuid(value, '父级 ID')
  return value
}

export function validateAndNormalizeTree(value: unknown): VaultTreeV3 {
  assertJsonObject(value, '知识库树')
  if (value.schemaVersion !== 3) {
    if (typeof value.schemaVersion === 'number') {
      throw new KnowledgeValidationError('UNSUPPORTED_VERSION', '不支持的知识库树版本')
    }
    throw new KnowledgeValidationError('CORRUPT_DATA', '知识库树结构无效')
  }
  if (!Array.isArray(value.entries)) {
    throw new KnowledgeValidationError('CORRUPT_DATA', '知识库树条目无效')
  }
  const entries: TreeEntryV3[] = value.entries.map((raw, sourceIndex) => {
    assertJsonObject(raw, `知识库树条目 ${sourceIndex}`)
    assertUuid(raw.id, '树条目 ID')
    const parentId = entryParent(raw.parentId)
    if (!Number.isInteger(raw.order) || Number(raw.order) < 0) {
      throw new KnowledgeValidationError('CORRUPT_DATA', '树条目顺序无效')
    }
    if (raw.kind === 'group') {
      return {
        ...cloneJson(raw), kind: 'group', id: raw.id,
        name: normalizeName(raw.name, '分组名称'), parentId, order: Number(raw.order),
      } as GroupEntryV3
    }
    if (
      raw.kind === 'content' &&
      (raw.contentType === 'document' || raw.contentType === 'canvas' || raw.contentType === 'mindmap')
    ) {
      assertIsoTimestamp(raw.createdAt, '创建时间')
      assertIsoTimestamp(raw.updatedAt, '更新时间')
      return {
        ...cloneJson(raw), kind: 'content', id: raw.id, contentType: raw.contentType,
        title: normalizeName(raw.title, '内容标题'), parentId, order: Number(raw.order),
        createdAt: raw.createdAt, updatedAt: raw.updatedAt,
      } as ContentEntryV3
    }
    throw new KnowledgeValidationError('CORRUPT_DATA', '未知的知识库树条目')
  })
  const byId = new Map<string, TreeEntryV3>()
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
    const visited = new Set([entry.id])
    let parentId = entry.parentId
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new KnowledgeValidationError('CONFLICT', '知识库树存在分组循环')
      }
      visited.add(parentId)
      parentId = byId.get(parentId)?.parentId ?? null
    }
  }
  const siblings = new Map<string, Array<{ entry: TreeEntryV3; sourceIndex: number }>>()
  entries.forEach((entry, sourceIndex) => {
    const key = entry.parentId ?? '__root__'
    const list = siblings.get(key) ?? []
    list.push({ entry, sourceIndex })
    siblings.set(key, list)
  })
  for (const list of siblings.values()) {
    list.sort((left, right) => left.entry.order - right.entry.order || left.sourceIndex - right.sourceIndex)
      .forEach(({ entry }, order) => { entry.order = order })
  }
  return { schemaVersion: 3, entries }
}

interface AssetOperationRecord {
  schemaVersion: 1
  kind: 'import' | 'delete'
  assetId: string
  entry: AssetManifestEntry
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
    try { await this.fileSystem.access(target); return true } catch { return false }
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

  async atomicWriteFile(target: string, value: string | Uint8Array): Promise<void> {
    try {
      await atomicCommitFile(this.fileSystem, target, value)
    } catch (error) {
      throw persistenceError('原子写入文件', error)
    }
  }

  async atomicWriteJson(target: string, value: JsonValue): Promise<void> {
    if (!isJsonValue(value)) throw new KnowledgeValidationError('INVALID_INPUT', '写入值不是有效 JSON')
    await this.atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`)
  }

  async readVault(vaultId: string): Promise<VaultV3> {
    const raw = await this.readJson<JsonValue>(this.paths.vaultMeta(vaultId), '知识库元数据')
    assertJsonObject(raw, '知识库元数据')
    if (raw.schemaVersion !== 3) throw new KnowledgeValidationError('UNSUPPORTED_VERSION', '不支持的知识库版本')
    assertJsonObject(raw.formatVersions, '知识库格式版本')
    for (const [domain, version] of Object.entries(VAULT_FORMAT_VERSIONS)) {
      if (raw.formatVersions[domain] !== version) {
        throw new KnowledgeValidationError('UNSUPPORTED_VERSION', `${domain} 格式版本不受支持`)
      }
    }
    assertUuid(raw.id, '知识库 ID')
    if (raw.id !== vaultId) throw new KnowledgeValidationError('CORRUPT_DATA', '知识库 ID 不一致')
    assertIsoTimestamp(raw.createdAt, '知识库创建时间')
    return {
      ...cloneJson(raw), schemaVersion: 3, formatVersions: { ...VAULT_FORMAT_VERSIONS },
      id: raw.id, name: normalizeName(raw.name, '知识库名称'), createdAt: raw.createdAt,
    } as VaultV3
  }

  async writeVault(value: VaultV3): Promise<void> {
    assertUuid(value.id, '知识库 ID')
    assertIsoTimestamp(value.createdAt, '知识库创建时间')
    const normalized = {
      ...cloneJson(value as unknown as JsonValue) as object,
      schemaVersion: 3, formatVersions: { ...VAULT_FORMAT_VERSIONS }, id: value.id,
      name: normalizeName(value.name, '知识库名称'), createdAt: value.createdAt,
    } as VaultV3
    await this.atomicWriteJson(this.paths.vaultMeta(value.id), normalized as unknown as JsonValue)
  }

  async removeVault(vaultId: string): Promise<void> {
    try { await this.fileSystem.rm(this.paths.vault(vaultId), { recursive: true, force: false }) }
    catch (error) { throw persistenceError('删除知识库', error) }
  }

  async listVaults(): Promise<VaultV3[]> {
    await this.ensureLayout()
    const entries = await this.fileSystem.readdir(this.paths.vaultsRoot, { withFileTypes: true }) as Array<{
      name: string; isDirectory(): boolean
    }>
    const vaults: VaultV3[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      assertUuid(entry.name, '知识库目录 ID')
      vaults.push(await this.readVault(entry.name))
    }
    return vaults.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  }

  async listVaultDirectoryIds(): Promise<string[]> {
    await this.ensureLayout()
    const entries = await this.fileSystem.readdir(this.paths.vaultsRoot, { withFileTypes: true }) as Array<{
      name: string; isDirectory(): boolean
    }>
    return entries.flatMap((entry) => {
      if (!entry.isDirectory()) return []
      try { assertUuid(entry.name, '知识库 ID'); return [entry.name] } catch { return [] }
    })
  }

  async readTree(vaultId: string): Promise<VaultTreeV3> {
    return validateAndNormalizeTree(await this.readJson<JsonValue>(this.paths.tree(vaultId), '知识库树'))
  }

  async writeTree(vaultId: string, tree: VaultTreeV3): Promise<VaultTreeV3> {
    const normalized = validateAndNormalizeTree(tree)
    await this.atomicWriteJson(this.paths.tree(vaultId), normalized as unknown as JsonValue)
    return normalized
  }

  async contentSummary(_vaultId: string, entry: ContentEntryV3): Promise<ContentSummary> {
    return {
      id: entry.id, contentType: entry.contentType, title: entry.title,
      parentId: entry.parentId, order: entry.order,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    }
  }

  async listContentSummaries(vaultId: string): Promise<ContentSummary[]> {
    const tree = await this.readTree(vaultId)
    return tree.entries.filter((entry): entry is ContentEntryV3 => entry.kind === 'content')
      .map((entry) => ({
        id: entry.id, contentType: entry.contentType, title: entry.title,
        parentId: entry.parentId, order: entry.order,
        createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      }))
  }

  private async jsonIds(directory: string, label: string): Promise<Set<string>> {
    let names: string[]
    try { names = await this.fileSystem.readdir(directory) as string[] }
    catch (error) {
      if (isPlainObject(error) && error.code === 'ENOENT') return new Set()
      throw persistenceError(`读取${label}目录`, error)
    }
    const ids = new Set<string>()
    for (const name of names) {
      const match = /^([0-9a-f-]{36})\.json$/i.exec(name)
      if (!match) continue
      assertUuid(match[1], `${label} ID`)
      if (ids.has(match[1])) throw new KnowledgeValidationError('CONFLICT', `${label} ID 重复: ${match[1]}`)
      ids.add(match[1])
    }
    return ids
  }

  async scanResourceLocator(vaultId: string): Promise<VaultResourceLocator> {
    const [documents, canvases, mindMaps, manifest] = await Promise.all([
      this.jsonIds(this.paths.documents(vaultId), '文档'),
      this.jsonIds(this.paths.canvases(vaultId), '画布'),
      this.jsonIds(this.paths.mindMaps(vaultId), '思维导图'),
      this.readAssetManifest(vaultId),
    ])
    const all = new Map<string, string>()
    const inventories: Array<[string, Set<string>]> = [
      ['document', documents], ['canvas', canvases], ['mindmap', mindMaps],
      ['asset', new Set(Object.keys(manifest.assets))],
    ]
    for (const [type, ids] of inventories) {
      for (const id of ids) {
        const previous = all.get(id)
        if (previous) {
          throw new KnowledgeValidationError('CONFLICT', `资源 ID ${id} 同时用于 ${previous} 和 ${type}`)
        }
        all.set(id, type)
      }
    }
    return { documents, canvases, mindMaps, assets: new Map(Object.entries(manifest.assets)) }
  }

  private async assertResourceTypeAvailable(
    vaultId: string,
    resourceId: string,
    expectedType: 'document' | 'canvas' | 'mindmap',
  ): Promise<void> {
    const inventory = await this.scanResourceLocator(vaultId)
    const occupied = inventory.documents.has(resourceId) ? 'document'
      : inventory.canvases.has(resourceId) ? 'canvas'
        : inventory.mindMaps.has(resourceId) ? 'mindmap'
          : inventory.assets.has(resourceId) ? 'asset' : null
    if (occupied && occupied !== expectedType) {
      throw new KnowledgeValidationError(
        'CONFLICT', `资源 ID ${resourceId} 已被 ${occupied} 使用`,
      )
    }
  }

  async readDocument(vaultId: string, documentId: string): Promise<TipTapDocument> {
    const value = await this.readJson<JsonValue>(this.paths.documentFile(vaultId, documentId), '文档')
    return normalizeTipTapDocumentStructure(value)
  }

  async writeDocument(vaultId: string, documentId: string, value: TipTapDocument): Promise<void> {
    assertTipTapDocument(value)
    await this.assertResourceTypeAvailable(vaultId, documentId, 'document')
    await this.atomicWriteJson(this.paths.documentFile(vaultId, documentId), value as unknown as JsonValue)
  }

  async readCanvas(vaultId: string, canvasId: string): Promise<ExcalidrawScene> {
    const value = await this.readJson<JsonValue>(this.paths.canvasFile(vaultId, canvasId), '画布')
    return normalizeExcalidrawSceneStructure(value)
  }

  async writeCanvas(vaultId: string, canvasId: string, value: ExcalidrawScene): Promise<void> {
    assertExcalidrawScene(value)
    await this.assertResourceTypeAvailable(vaultId, canvasId, 'canvas')
    await this.atomicWriteJson(this.paths.canvasFile(vaultId, canvasId), value as unknown as JsonValue)
  }

  async readMindMap(vaultId: string, mindMapId: string): Promise<MindMapData> {
    const value = await this.readJson<JsonValue>(this.paths.mindMapFile(vaultId, mindMapId), '思维导图')
    assertMindMapData(value)
    return value
  }

  async writeMindMap(vaultId: string, mindMapId: string, value: MindMapData): Promise<void> {
    assertMindMapData(value)
    await this.assertResourceTypeAvailable(vaultId, mindMapId, 'mindmap')
    await this.atomicWriteJson(this.paths.mindMapFile(vaultId, mindMapId), value as unknown as JsonValue)
  }

  async deleteCanvas(vaultId: string, canvasId: string): Promise<void> {
    await this.removeFile(this.paths.canvasFile(vaultId, canvasId), '删除画布')
  }

  async deleteMindMap(vaultId: string, mindMapId: string): Promise<void> {
    await this.removeFile(this.paths.mindMapFile(vaultId, mindMapId), '删除思维导图')
  }

  private async removeFile(target: string, action: string): Promise<void> {
    try { await this.fileSystem.rm(target) } catch (error) { throw persistenceError(action, error) }
  }

  async readAssetManifest(vaultId: string): Promise<AssetManifest> {
    const value = await this.readJson<JsonValue>(this.paths.assetManifest(vaultId), '附件清单')
    assertAssetManifest(value)
    return value
  }

  async writeAssetManifest(vaultId: string, manifest: AssetManifest): Promise<void> {
    assertAssetManifest(manifest)
    await this.atomicWriteJson(this.paths.assetManifest(vaultId), manifest as unknown as JsonValue)
  }

  async initializeAssetManifest(vaultId: string): Promise<void> {
    await this.writeAssetManifest(vaultId, { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets: {} })
  }

  private async writeAssetOperation(
    vaultId: string,
    assetId: string,
    record: AssetOperationRecord,
  ): Promise<string> {
    const operation = this.paths.assetOperation(vaultId, assetId)
    await this.atomicWriteJson(resolveInside(operation, 'operation.json'), record as unknown as JsonValue)
    return operation
  }

  async writeAsset(
    vaultId: string,
    assetId: string,
    fileName: string,
    mimeType: string,
    bytes: Uint8Array,
  ): Promise<AssetData> {
    assertUuid(assetId, '附件 ID')
    assertMimeType(mimeType, '附件 MIME 类型')
    const extension = extensionOf(fileName)
    const manifest = await this.readAssetManifest(vaultId)
    if (manifest.assets[assetId]) throw new KnowledgeValidationError('CONFLICT', '附件 ID 已存在')
    const inventory = await this.scanResourceLocator(vaultId)
    if (inventory.documents.has(assetId) || inventory.canvases.has(assetId) || inventory.mindMaps.has(assetId)) {
      throw new KnowledgeValidationError('CONFLICT', '附件 ID 与其他资源冲突')
    }
    const now = new Date().toISOString()
    const entry: AssetManifestEntry = {
      fileName, extension, mimeType, size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      createdAt: now, updatedAt: now,
    }
    const operation = await this.writeAssetOperation(vaultId, assetId, {
      schemaVersion: 1, kind: 'import', assetId, entry,
    })
    const staged = resolveInside(operation, 'bytes')
    const target = this.paths.assetFile(vaultId, assetId, extension)
    try {
      await this.atomicWriteFile(staged, bytes)
      await this.movePath(staged, target)
      manifest.assets[assetId] = entry
      await this.writeAssetManifest(vaultId, manifest)
      await this.fileSystem.rm(operation, { recursive: true, force: true })
      return { id: assetId, ...entry, bytes: new Uint8Array(bytes) }
    } catch (error) {
      throw persistenceError('导入附件', error)
    }
  }

  async readAsset(vaultId: string, assetId: string): Promise<AssetData> {
    assertUuid(assetId, '附件 ID')
    const manifest = await this.readAssetManifest(vaultId)
    const entry = manifest.assets[assetId]
    if (!entry) throw new KnowledgeValidationError('NOT_FOUND', '附件不存在')
    const target = this.paths.assetFile(vaultId, assetId, entry.extension)
    let bytes: Uint8Array
    try { bytes = new Uint8Array(await this.fileSystem.readFile(target) as Buffer) }
    catch (error) { throw persistenceError('读取附件', error) }
    if (bytes.byteLength !== entry.size) {
      throw new KnowledgeValidationError('CORRUPT_DATA', '附件大小与清单不一致')
    }
    return { id: assetId, ...entry, bytes }
  }

  async readAssetMetadata(vaultId: string, assetId: string): Promise<AssetMetadata> {
    assertUuid(assetId, '附件 ID')
    const entry = (await this.readAssetManifest(vaultId)).assets[assetId]
    if (!entry) throw new KnowledgeValidationError('NOT_FOUND', '附件不存在')
    return { id: assetId, ...entry }
  }

  async deleteAsset(vaultId: string, assetId: string): Promise<void> {
    const manifest = await this.readAssetManifest(vaultId)
    const entry = manifest.assets[assetId]
    if (!entry) throw new KnowledgeValidationError('NOT_FOUND', '附件不存在')
    const operation = await this.writeAssetOperation(vaultId, assetId, {
      schemaVersion: 1, kind: 'delete', assetId, entry,
    })
    const target = this.paths.assetFile(vaultId, assetId, entry.extension)
    const staged = resolveInside(operation, 'bytes')
    try {
      await this.movePath(target, staged)
      delete manifest.assets[assetId]
      await this.writeAssetManifest(vaultId, manifest)
      await this.fileSystem.rm(operation, { recursive: true, force: true })
    } catch (error) {
      throw persistenceError('删除附件', error)
    }
  }

  private async movePath(source: string, target: string): Promise<void> {
    try {
      await this.fileSystem.mkdir(path.dirname(target), { recursive: true })
      await this.fileSystem.rename(source, target)
    } catch (error) { throw persistenceError('移动内容', error) }
  }

  async stageContentDeletion(vaultId: string, contentType: ContentType, contentId: string): Promise<string> {
    const target = this.paths.operationItem(vaultId, 'trash', contentType, contentId)
    await this.movePath(this.paths.activeContent(vaultId, contentType, contentId), target)
    return target
  }

  async restoreContentDeletion(vaultId: string, contentType: ContentType, contentId: string): Promise<void> {
    await this.movePath(
      this.paths.operationItem(vaultId, 'trash', contentType, contentId),
      this.paths.activeContent(vaultId, contentType, contentId),
    )
  }

  async purgeContentDeletion(vaultId: string, contentType: ContentType, contentId: string): Promise<void> {
    await this.fileSystem.rm(this.paths.operationItem(vaultId, 'trash', contentType, contentId), { force: true })
  }

  private async stageNewContent(
    vaultId: string,
    contentType: ContentType,
    contentId: string,
    value: TipTapDocument | ExcalidrawScene | MindMapData,
  ): Promise<string> {
    if (contentType === 'document') assertTipTapDocument(value)
    else if (contentType === 'canvas') assertExcalidrawScene(value)
    else assertMindMapData(value)
    const stage = this.paths.operationItem(vaultId, 'staging', contentType, contentId)
    await this.atomicWriteJson(stage, value as unknown as JsonValue)
    return stage
  }

  async stageNewDocument(vaultId: string, documentId: string, value: TipTapDocument): Promise<string> {
    return this.stageNewContent(vaultId, 'document', documentId, value)
  }

  async stageNewCanvas(vaultId: string, canvasId: string, value: ExcalidrawScene): Promise<string> {
    return this.stageNewContent(vaultId, 'canvas', canvasId, value)
  }

  async stageNewMindMap(vaultId: string, mindMapId: string, value: MindMapData): Promise<string> {
    return this.stageNewContent(vaultId, 'mindmap', mindMapId, value)
  }

  async activateStagedContent(vaultId: string, contentType: ContentType, contentId: string): Promise<void> {
    await this.movePath(
      this.paths.operationItem(vaultId, 'staging', contentType, contentId),
      this.paths.activeContent(vaultId, contentType, contentId),
    )
  }

  async discardStagedContent(vaultId: string, contentType: ContentType, contentId: string): Promise<void> {
    await this.fileSystem.rm(this.paths.operationItem(vaultId, 'staging', contentType, contentId), { force: true })
  }

  private parseOperationName(name: string): { contentType: ContentType; contentId: string } | null {
    const match = /^(document|canvas|mindmap)-([0-9a-f-]{36})\.json$/i.exec(name)
    if (!match) return null
    try { assertUuid(match[2], '内容 ID'); return { contentType: match[1] as ContentType, contentId: match[2] } }
    catch { return null }
  }

  private async reconcileAssetOperations(vaultId: string): Promise<void> {
    const root = this.paths.assetOperations(vaultId)
    if (!(await this.exists(root))) return
    const names = await this.fileSystem.readdir(root) as string[]
    for (const name of names) {
      let assetId: string
      try { assertUuid(name, '附件操作 ID'); assetId = name } catch { continue }
      const operation = this.paths.assetOperation(vaultId, assetId)
      const raw = await this.readJson<JsonValue>(resolveInside(operation, 'operation.json'), '附件操作')
      assertJsonObject(raw, '附件操作')
      if (raw.schemaVersion !== 1 || (raw.kind !== 'import' && raw.kind !== 'delete') || raw.assetId !== assetId) continue
      assertAssetManifestEntry(raw.entry, '附件操作元数据')
      const entry = raw.entry
      const manifest = await this.readAssetManifest(vaultId)
      const staged = resolveInside(operation, 'bytes')
      const target = this.paths.assetFile(vaultId, assetId, entry.extension)
      if (raw.kind === 'import') {
        if (!(await this.exists(target)) && await this.exists(staged)) await this.movePath(staged, target)
        if (await this.exists(target)) {
          manifest.assets[assetId] = entry
          await this.writeAssetManifest(vaultId, manifest)
          await this.fileSystem.rm(operation, { recursive: true, force: true })
        }
      } else {
        delete manifest.assets[assetId]
        await this.writeAssetManifest(vaultId, manifest)
        await this.fileSystem.rm(operation, { recursive: true, force: true })
      }
    }
  }

  async reconcileVaultOperations(vaultId: string): Promise<void> {
    const tree = await this.readTree(vaultId)
    const active = new Set(tree.entries.filter(
      (entry): entry is ContentEntryV3 => entry.kind === 'content',
    ).map((entry) => `${entry.contentType}:${entry.id}`))
    for (const state of ['staging', 'trash'] as const) {
      const root = this.paths.operationRoot(vaultId, state)
      if (!(await this.exists(root))) continue
      const names = await this.fileSystem.readdir(root) as string[]
      for (const name of names) {
        const item = this.parseOperationName(name)
        if (!item) continue
        const key = `${item.contentType}:${item.contentId}`
        const targetExists = await this.exists(this.paths.activeContent(vaultId, item.contentType, item.contentId))
        if (state === 'staging') {
          if (active.has(key) && !targetExists) await this.activateStagedContent(vaultId, item.contentType, item.contentId)
          else await this.discardStagedContent(vaultId, item.contentType, item.contentId)
        } else if (active.has(key) && !targetExists) {
          await this.restoreContentDeletion(vaultId, item.contentType, item.contentId)
        } else if (!active.has(key)) {
          await this.purgeContentDeletion(vaultId, item.contentType, item.contentId)
        }
      }
    }
    await this.reconcileAssetOperations(vaultId)
  }

  async setMtime(target: string, timestamp: string): Promise<void> {
    assertIsoTimestamp(timestamp, '修改时间')
    try { const date = new Date(timestamp); await this.fileSystem.utimes(target, date, date) }
    catch (error) { throw persistenceError('设置修改时间', error) }
  }

  async completedMigrationStage(vaultId: string): Promise<boolean> {
    if (!(await this.exists(this.paths.migrationMarker(vaultId)))) return false
    try {
      const marker = await this.readJson<JsonValue>(this.paths.migrationMarker(vaultId), '迁移完成标记')
      assertJsonObject(marker, '迁移完成标记')
      return marker.schemaVersion === 3 && marker.vaultId === vaultId
    } catch { return false }
  }

  async listBackups(vaultId: string): Promise<string[]> {
    await this.ensureLayout()
    const names = await this.fileSystem.readdir(this.paths.backupsRoot) as string[]
    return names.filter((name) => name.startsWith(`${vaultId}-v2-`)).sort().reverse()
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
      await this.fileSystem.rm(resolveInside(active, '.migration-complete.json'), { force: true })
      return
    }
    if (!activeExists && backups.length > 0) {
      await this.movePath(backups[0], active)
      return
    }
    if (activeExists && await this.exists(this.paths.vaultMeta(vaultId))) {
      const raw = await this.readJson<JsonValue>(this.paths.vaultMeta(vaultId), '知识库元数据')
      if (isPlainObject(raw) && raw.schemaVersion === 3) await this.reconcileVaultOperations(vaultId)
    }
  }
}
