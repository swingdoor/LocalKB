import * as path from 'path'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import type {
  AssetManifest,
  AssetManifestEntry,
  ExcalidrawScene,
  JsonValue,
  MindMapData,
  TipTapDocument,
  TipTapNode,
  TreeEntryV3,
  VaultTreeV3,
  VaultV3,
} from '../../shared/knowledge-types'
import { VAULT_FORMAT_VERSIONS } from '../../shared/knowledge-types'
import {
  collectDocumentReferences,
  collectInternalDocumentReferences,
} from '../../shared/knowledge-operations'
import {
  assertExcalidrawScene,
  assertJsonObject,
  assertMindMapData,
  assertPathSegment,
  assertTipTapDocument,
  assertUuid,
  cloneJson,
  isPlainObject,
  KnowledgeValidationError,
  normalizeName,
} from '../../shared/knowledge-validation'
import {
  FileKnowledgeStore,
  type FileSystemApi,
  resolveInside,
  validateAndNormalizeTree,
} from './file-knowledge-store'
import { inspectVaultIntegrity } from './knowledge-integrity'

const nodeFs = fs as unknown as FileSystemApi

interface VaultV2 {
  schemaVersion: 2
  id: string
  name: string
  createdAt: string
}

interface GroupEntryV2 {
  kind: 'group'
  id: string
  name: string
  parentId: string | null
  order: number
}

interface ContentEntryV2 {
  kind: 'content'
  id: string
  contentType: 'document' | 'canvas'
  title: string
  parentId: string | null
  order: number
  createdAt: string
  metadataUpdatedAt: string
}

type TreeEntryV2 = GroupEntryV2 | ContentEntryV2

interface VaultTreeV2 {
  schemaVersion: 2
  entries: TreeEntryV2[]
}

export interface MigrationIssue {
  severity: 'warning' | 'error'
  code: string
  scope: 'vault' | 'tree' | 'document' | 'canvas' | 'mindmap' | 'asset'
  resourceId?: string
  message: string
}

export interface MigrationInventory {
  vaultId: string
  sourceVersion: 2 | 3 | 'unknown'
  documents: number
  canvases: number
  mindMaps: number
  assets: number
  assetBytes: number
  references: number
  issues: MigrationIssue[]
  canMigrate: boolean
}

interface V2Asset {
  id: string
  extension: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
  createdAt: string
  updatedAt: string
}

interface V2Snapshot {
  vault: VaultV2
  tree: VaultTreeV2
  v3Tree: VaultTreeV3
  documents: Map<string, TipTapDocument>
  canvases: Map<string, ExcalidrawScene>
  mindMaps: Map<string, MindMapData>
  assets: Map<string, V2Asset>
  inventory: MigrationInventory
}

export interface StagedMigration {
  vaultId: string
  stagePath: string
  inventory: MigrationInventory
}

export interface ActivatedMigration {
  vaultId: string
  activePath: string
  backupPath: string
}

const EXTENSION_MIMES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain',
  md: 'text/markdown', json: 'application/json', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

function migrationError(message: string, details?: JsonValue): KnowledgeValidationError {
  return new KnowledgeValidationError('MIGRATION_FAILED', message, details)
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw migrationError(`${label}无效`)
  return value
}

function optionalDirectoryError(error: unknown): boolean {
  return isPlainObject(error) && error.code === 'ENOENT'
}

function normalizeV2Tree(value: unknown): { legacy: VaultTreeV2; current: VaultTreeV3 } {
  assertJsonObject(value, '版本 2 知识库树')
  if (value.schemaVersion !== 2 || !Array.isArray(value.entries)) throw migrationError('版本 2 知识库树无效')
  const legacy: TreeEntryV2[] = []
  const current: TreeEntryV3[] = []
  value.entries.forEach((raw, index) => {
    assertJsonObject(raw, `版本 2 树条目 ${index}`)
    assertUuid(raw.id, '版本 2 树条目 ID')
    if (raw.parentId !== null) assertUuid(raw.parentId, '版本 2 父级 ID')
    if (!Number.isInteger(raw.order) || Number(raw.order) < 0) throw migrationError('版本 2 树顺序无效')
    if (raw.kind === 'group') {
      const entry: GroupEntryV2 = {
        kind: 'group', id: raw.id, name: normalizeName(raw.name),
        parentId: raw.parentId as string | null, order: Number(raw.order),
      }
      legacy.push(entry)
      current.push({ ...entry })
      return
    }
    if (raw.kind !== 'content' || (raw.contentType !== 'document' && raw.contentType !== 'canvas')) {
      throw migrationError('版本 2 树包含未知条目')
    }
    const createdAt = timestamp(raw.createdAt, '版本 2 创建时间')
    const updatedAt = timestamp(raw.metadataUpdatedAt, '版本 2 更新时间')
    const entry: ContentEntryV2 = {
      kind: 'content', id: raw.id, contentType: raw.contentType,
      title: normalizeName(raw.title), parentId: raw.parentId as string | null,
      order: Number(raw.order), createdAt, metadataUpdatedAt: updatedAt,
    }
    legacy.push(entry)
    current.push({
      kind: 'content', id: entry.id, contentType: entry.contentType,
      title: entry.title, parentId: entry.parentId, order: entry.order,
      createdAt, updatedAt,
    })
  })
  return {
    legacy: { schemaVersion: 2, entries: legacy },
    current: validateAndNormalizeTree({ schemaVersion: 3, entries: current }),
  }
}

function canonicalizeAttachments(document: TipTapDocument): TipTapDocument {
  const result = cloneJson(document)
  const visit = (node: TipTapNode): void => {
    if (node.type === 'fileAttachment') {
      const attrs = node.attrs ?? {}
      const displayName = typeof attrs.displayName === 'string'
        ? attrs.displayName
        : typeof attrs.fileName === 'string' ? attrs.fileName : undefined
      node.attrs = {
        ...(attrs.nodeId === undefined ? {} : { nodeId: attrs.nodeId }),
        assetId: attrs.assetId,
        ...(displayName ? { displayName } : {}),
      }
    }
    node.content?.forEach(visit)
  }
  visit(result)
  assertTipTapDocument(result)
  return result
}

function repairLegacyTaskListWrapper(document: TipTapDocument): {
  document: TipTapDocument
  repaired: boolean
} {
  const result = cloneJson(document)
  let repaired = false
  const visit = (node: TipTapNode): void => {
    if (!node.content) return
    const next: TipTapNode[] = []
    for (const child of node.content) {
      if (
        child.type === 'paragraph' && child.content?.length === 1 &&
        child.content[0].type === 'taskList'
      ) {
        next.push(child.content[0])
        repaired = true
      } else {
        next.push(child)
      }
    }
    node.content = next
    node.content.forEach(visit)
  }
  visit(result)
  return { document: result, repaired }
}

function legacyAttachmentMetadata(
  document: TipTapDocument,
): Array<{ assetId: string; fileName: string; mimeType?: string; size?: number }> {
  const result: Array<{ assetId: string; fileName: string; mimeType?: string; size?: number }> = []
  const visit = (node: TipTapNode): void => {
    if (node.type === 'fileAttachment') {
      const attrs = node.attrs ?? {}
      assertUuid(attrs.nodeId, '旧附件节点 ID')
      assertUuid(attrs.assetId, '旧附件 ID')
      const fileName = typeof attrs.fileName === 'string'
        ? attrs.fileName
        : typeof attrs.displayName === 'string' ? attrs.displayName : undefined
      if (!fileName) throw migrationError(`附件 ${attrs.assetId} 缺少文件名`)
      assertPathSegment(fileName, '附件文件名')
      result.push({
        assetId: attrs.assetId,
        fileName,
        ...(typeof attrs.mimeType === 'string' ? { mimeType: attrs.mimeType } : {}),
        ...(typeof attrs.size === 'number' ? { size: attrs.size } : {}),
      })
    }
    node.content?.forEach(visit)
  }
  visit(document)
  return result
}

export class VaultMigrator {
  constructor(
    private readonly store: FileKnowledgeStore,
    private readonly fileSystem: FileSystemApi = nodeFs,
  ) {}

  private async names(directory: string): Promise<string[]> {
    try { return await this.fileSystem.readdir(directory) as string[] }
    catch (error) { if (optionalDirectoryError(error)) return []; throw error }
  }

  private async readJson(target: string, label: string): Promise<unknown> {
    try { return JSON.parse(String(await this.fileSystem.readFile(target, 'utf8'))) as unknown }
    catch (error) { throw migrationError(`${label}读取失败: ${error instanceof Error ? error.message : '未知错误'}`) }
  }

  private async readSnapshot(vaultId: string): Promise<V2Snapshot> {
    assertUuid(vaultId, '知识库 ID')
    const inventory: MigrationInventory = {
      vaultId, sourceVersion: 2, documents: 0, canvases: 0, mindMaps: 0,
      assets: 0, assetBytes: 0, references: 0, issues: [], canMigrate: false,
    }
    const metaRaw = await this.readJson(this.store.paths.vaultMeta(vaultId), '版本 2 元数据')
    assertJsonObject(metaRaw, '版本 2 元数据')
    if (metaRaw.schemaVersion !== 2) throw migrationError('源知识库不是版本 2')
    assertUuid(metaRaw.id, '版本 2 知识库 ID')
    if (metaRaw.id !== vaultId) throw migrationError('版本 2 知识库 ID 不一致')
    const vault: VaultV2 = {
      schemaVersion: 2, id: metaRaw.id, name: normalizeName(metaRaw.name),
      createdAt: timestamp(metaRaw.createdAt, '版本 2 知识库创建时间'),
    }
    const { legacy: tree, current: v3Tree } = normalizeV2Tree(
      await this.readJson(this.store.paths.tree(vaultId), '版本 2 知识库树'),
    )
    const documents = new Map<string, TipTapDocument>()
    const canvases = new Map<string, ExcalidrawScene>()
    const mindMaps = new Map<string, MindMapData>()
    const assets = new Map<string, V2Asset>()
    const idTypes = new Map<string, string>()
    const addId = (id: string, type: string): void => {
      const previous = idTypes.get(id)
      if (previous) throw migrationError(`资源 ID ${id} 同时用于 ${previous} 和 ${type}`)
      idTypes.set(id, type)
    }
    const attachmentMetadata = new Map<string, { fileName: string; mimeType?: string; size?: number }>()

    for (const entry of tree.entries) {
      if (entry.kind !== 'content') continue
      addId(entry.id, entry.contentType)
      if (entry.contentType === 'canvas') {
        const scene = await this.readJson(
          resolveInside(this.store.paths.vault(vaultId), 'canvases', `${entry.id}.json`),
          `画布 ${entry.id}`,
        )
        assertExcalidrawScene(scene)
        canvases.set(entry.id, scene)
        continue
      }
      const documentRoot = resolveInside(this.store.paths.vault(vaultId), 'documents', entry.id)
      const original = await this.readJson(resolveInside(documentRoot, 'document.json'), `文档 ${entry.id}`)
      assertJsonObject(original, `文档 ${entry.id}`)
      const repaired = repairLegacyTaskListWrapper(original as unknown as TipTapDocument)
      if (repaired.repaired) inventory.issues.push({
        severity: 'warning', code: 'V2_TASK_LIST_WRAPPER_NORMALIZED', scope: 'document',
        resourceId: entry.id,
        message: '已移除旧版本产生的空段落任务列表包装，任务内容和节点 ID 保持不变',
      })
      const document = canonicalizeAttachments(repaired.document)
      documents.set(entry.id, document)
      for (const attachment of legacyAttachmentMetadata(original as unknown as TipTapDocument)) {
        const candidate = {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
        }
        const previous = attachmentMetadata.get(attachment.assetId)
        if (previous && JSON.stringify(previous) !== JSON.stringify(candidate)) {
          throw migrationError(`附件 ${attachment.assetId} 的旧元数据不一致`)
        }
        attachmentMetadata.set(attachment.assetId, candidate)
      }
      for (const name of await this.names(resolveInside(documentRoot, 'canvases'))) {
        const match = /^([0-9a-f-]{36})\.json$/i.exec(name)
        if (!match) throw migrationError(`画布文件名无效: ${name}`)
        assertUuid(match[1], '画布 ID'); addId(match[1], 'canvas')
        const value = await this.readJson(resolveInside(documentRoot, 'canvases', name), `画布 ${match[1]}`)
        assertExcalidrawScene(value); canvases.set(match[1], value)
      }
      for (const name of await this.names(resolveInside(documentRoot, 'mindmaps'))) {
        const match = /^([0-9a-f-]{36})\.json$/i.exec(name)
        if (!match) throw migrationError(`思维导图文件名无效: ${name}`)
        assertUuid(match[1], '思维导图 ID'); addId(match[1], 'mindmap')
        const value = await this.readJson(resolveInside(documentRoot, 'mindmaps', name), `思维导图 ${match[1]}`)
        assertMindMapData(value); mindMaps.set(match[1], value)
      }
      for (const name of await this.names(resolveInside(documentRoot, 'assets'))) {
        const match = /^([0-9a-f-]{36})\.([a-z0-9]{1,16})$/i.exec(name)
        if (!match) throw migrationError(`附件文件名无效: ${name}`)
        const [, id, extensionRaw] = match
        assertUuid(id, '附件 ID'); addId(id, 'asset')
        const extension = extensionRaw.toLowerCase()
        const bytes = new Uint8Array(await this.fileSystem.readFile(
          resolveInside(documentRoot, 'assets', name),
        ) as Buffer)
        const metadata = attachmentMetadata.get(id)
        if (metadata?.size !== undefined && metadata.size !== bytes.byteLength) {
          throw migrationError(`附件 ${id} 的旧 size 与实际字节数不一致`)
        }
        const fileName = metadata?.fileName ?? `${id}.${extension}`
        assertPathSegment(fileName, '附件文件名')
        assets.set(id, {
          id, extension, fileName,
          mimeType: metadata?.mimeType ?? EXTENSION_MIMES[extension] ?? 'application/octet-stream',
          bytes, createdAt: entry.createdAt, updatedAt: entry.metadataUpdatedAt,
        })
      }
    }

    const documentIds = new Set(documents.keys())
    for (const [documentId, document] of documents) {
      for (const reference of collectDocumentReferences(document)) {
        inventory.references += 1
        const exists = reference.type === 'canvas' ? canvases.has(reference.id)
          : reference.type === 'mindmap' ? mindMaps.has(reference.id) : assets.has(reference.id)
        if (!exists) throw migrationError(`文档 ${documentId} 引用了不存在的 ${reference.type} ${reference.id}`)
      }
      for (const reference of collectInternalDocumentReferences(document)) {
        if (!documentIds.has(reference.documentId)) {
          throw migrationError(`文档 ${documentId} 引用了不存在的文档 ${reference.documentId}`)
        }
      }
    }
    inventory.documents = documents.size
    inventory.canvases = canvases.size
    inventory.mindMaps = mindMaps.size
    inventory.assets = assets.size
    inventory.assetBytes = [...assets.values()].reduce((sum, asset) => sum + asset.bytes.byteLength, 0)
    inventory.canMigrate = true
    return { vault, tree, v3Tree, documents, canvases, mindMaps, assets, inventory }
  }

  async dryRun(vaultId: string): Promise<MigrationInventory> {
    try {
      const raw = await this.readJson(this.store.paths.vaultMeta(vaultId), '知识库元数据')
      if (isPlainObject(raw) && raw.schemaVersion === 3) {
        return {
          vaultId, sourceVersion: 3, documents: 0, canvases: 0, mindMaps: 0,
          assets: 0, assetBytes: 0, references: 0,
          issues: [{ severity: 'warning', code: 'ALREADY_V3', scope: 'vault', message: '知识库已经是版本 3' }],
          canMigrate: false,
        }
      }
      return (await this.readSnapshot(vaultId)).inventory
    } catch (error) {
      return {
        vaultId, sourceVersion: 'unknown', documents: 0, canvases: 0, mindMaps: 0,
        assets: 0, assetBytes: 0, references: 0,
        issues: [{
          severity: 'error', code: 'V2_PREFLIGHT_FAILED', scope: 'vault',
          message: error instanceof Error ? error.message : '版本 2 预检失败',
        }],
        canMigrate: false,
      }
    }
  }

  async stage(vaultId: string): Promise<StagedMigration> {
    const snapshot = await this.readSnapshot(vaultId)
    const stagePath = this.store.paths.migrationStage(vaultId)
    await this.fileSystem.rm(stagePath, { recursive: true, force: true })
    const stagingStore = new FileKnowledgeStore(this.store.paths.stagingRoot, this.fileSystem)
    const vault: VaultV3 = {
      schemaVersion: 3, formatVersions: { ...VAULT_FORMAT_VERSIONS },
      id: snapshot.vault.id, name: snapshot.vault.name, createdAt: snapshot.vault.createdAt,
    }
    await stagingStore.writeVault(vault)
    await stagingStore.writeTree(vaultId, snapshot.v3Tree)
    await stagingStore.initializeAssetManifest(vaultId)
    for (const [id, document] of snapshot.documents) await stagingStore.writeDocument(vaultId, id, document)
    for (const [id, canvas] of snapshot.canvases) await stagingStore.writeCanvas(vaultId, id, canvas)
    for (const [id, mindMap] of snapshot.mindMaps) await stagingStore.writeMindMap(vaultId, id, mindMap)
    const manifest: AssetManifest = { schemaVersion: 1, assets: {} }
    for (const [id, asset] of snapshot.assets) {
      const entry: AssetManifestEntry = {
        fileName: asset.fileName, extension: asset.extension, mimeType: asset.mimeType,
        size: asset.bytes.byteLength,
        sha256: createHash('sha256').update(asset.bytes).digest('hex'),
        createdAt: asset.createdAt, updatedAt: asset.updatedAt,
      }
      await stagingStore.atomicWriteFile(
        stagingStore.paths.assetFile(vaultId, id, asset.extension), asset.bytes,
      )
      manifest.assets[id] = entry
    }
    await stagingStore.writeAssetManifest(vaultId, manifest)
    await this.validateStage(vaultId, snapshot.inventory)
    await stagingStore.atomicWriteJson(this.store.paths.migrationMarker(vaultId), {
      schemaVersion: 3, sourceSchemaVersion: 2, vaultId,
      completedAt: new Date().toISOString(),
      counts: {
        documents: snapshot.inventory.documents, canvases: snapshot.inventory.canvases,
        mindMaps: snapshot.inventory.mindMaps, assets: snapshot.inventory.assets,
      },
    })
    return { vaultId, stagePath, inventory: snapshot.inventory }
  }

  async validateStage(vaultId: string, expected?: MigrationInventory): Promise<void> {
    const stagingStore = new FileKnowledgeStore(this.store.paths.stagingRoot, this.fileSystem)
    await stagingStore.readVault(vaultId)
    const tree = await stagingStore.readTree(vaultId)
    const locator = await stagingStore.scanResourceLocator(vaultId)
    for (const id of locator.documents) await stagingStore.readDocument(vaultId, id)
    for (const id of locator.canvases) await stagingStore.readCanvas(vaultId, id)
    for (const id of locator.mindMaps) await stagingStore.readMindMap(vaultId, id)
    for (const [id, metadata] of locator.assets) {
      const asset = await stagingStore.readAsset(vaultId, id)
      if (createHash('sha256').update(asset.bytes).digest('hex') !== metadata.sha256) {
        throw migrationError(`暂存附件 ${id} 哈希不一致`)
      }
    }
    for (const entry of tree.entries) {
      if (entry.kind !== 'content') continue
      const backing = entry.contentType === 'document' ? locator.documents
        : entry.contentType === 'canvas' ? locator.canvases : locator.mindMaps
      if (!backing.has(entry.id)) throw migrationError(`树条目 ${entry.id} 缺少原生资源`)
    }
    const integrity = await inspectVaultIntegrity(stagingStore, vaultId, { fullAssetHash: true })
    if (!integrity.healthy) {
      throw migrationError('暂存知识库完整性检查失败', integrity.issues as unknown as JsonValue)
    }
    if (expected && (
      locator.documents.size !== expected.documents || locator.canvases.size !== expected.canvases ||
      locator.mindMaps.size !== expected.mindMaps || locator.assets.size !== expected.assets
    )) throw migrationError('暂存知识库清单计数不一致')
  }

  async activate(vaultId: string): Promise<ActivatedMigration> {
    if (!(await this.store.completedMigrationStage(vaultId))) throw migrationError('迁移暂存区未完成验证')
    await this.validateStage(vaultId)
    const activePath = this.store.paths.vault(vaultId)
    const stagePath = this.store.paths.migrationStage(vaultId)
    const suffix = new Date().toISOString().replace(/[-:.]/g, '')
    const backupPath = this.store.paths.backup(vaultId, suffix)
    await this.fileSystem.mkdir(path.dirname(backupPath), { recursive: true })
    let backedUp = false
    try {
      await this.fileSystem.rename(activePath, backupPath)
      backedUp = true
      await this.fileSystem.mkdir(path.dirname(activePath), { recursive: true })
      await this.fileSystem.rename(stagePath, activePath)
      await this.fileSystem.rm(resolveInside(activePath, '.migration-complete.json'), { force: true })
      return { vaultId, activePath, backupPath }
    } catch (error) {
      if (backedUp && !(await this.store.exists(activePath))) {
        await this.fileSystem.rename(backupPath, activePath).catch(() => undefined)
      }
      throw migrationError(error instanceof Error ? error.message : '迁移激活失败')
    }
  }
}
