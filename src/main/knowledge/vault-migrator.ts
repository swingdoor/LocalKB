import * as path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import { v5 as uuidv5 } from 'uuid'
import type {
  ExcalidrawScene,
  JsonObject,
  MindMapData,
  TipTapDocument,
  TipTapNode,
  TreeEntryV2,
  VaultTreeV2,
  VaultV2,
} from '../../shared/knowledge-types'
import { collectDocumentReferences, normalizeDocumentNodeIds } from '../../shared/knowledge-operations'
import {
  assertExcalidrawScene,
  assertJsonObject,
  assertMindMapData,
  assertTipTapDocument,
  assertUuid,
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

const nodeFs = fs as unknown as FileSystemApi
const MIGRATION_NAMESPACE = '68d423b0-d5d6-4f54-a9e8-f5e3e50f4e6a'

interface LegacyVault {
  id: string
  name: string
  createdAt: string
}

interface LegacyMeta {
  vault: LegacyVault
  documents?: string[]
}

export interface LegacyDocument {
  id: string
  title: string
  content: string
  type: 'document' | 'drawing'
  createdAt: string
  updatedAt: string
}

interface LegacyGroupEntry {
  kind: 'group'
  id: string
  name: string
  parentId: string | null
  order: number
}

interface LegacyDocumentEntry {
  kind: 'document'
  id: string
  parentId: string | null
  order: number
}

interface LegacyStructure {
  version: 1
  entries: Array<LegacyGroupEntry | LegacyDocumentEntry>
}

export interface MigrationIssue {
  severity: 'warning' | 'error'
  code: string
  scope: 'vault' | 'tree' | 'document' | 'canvas' | 'mindmap' | 'asset'
  documentId?: string
  message: string
}

export interface MigrationInventory {
  vaultId: string
  sourceVersion: 1 | 2 | 'unknown'
  totalBytes: number
  topLevelDocuments: number
  topLevelCanvases: number
  groups: number
  embeddedCanvases: number
  embeddedMindMaps: number
  ownedAssets: number
  ownedAssetBytes: number
  remoteImages: number
  preservedLegacyNodes: number
  issues: MigrationIssue[]
  canMigrate: boolean
}

interface ConvertedAsset {
  id: string
  extension: string
  bytes: Uint8Array
}

interface ConvertedDocument {
  document: TipTapDocument
  canvases: Array<{ id: string; value: ExcalidrawScene }>
  mindMaps: Array<{ id: string; value: MindMapData }>
  assets: ConvertedAsset[]
  remoteImages: number
  preservedLegacyNodes: number
  warnings: MigrationIssue[]
}

interface LegacyVaultData {
  meta: LegacyMeta
  structure: LegacyStructure | null
  documents: LegacyDocument[]
  totalBytes: number
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

function migrationError(message: string): KnowledgeValidationError {
  return new KnowledgeValidationError('MIGRATION_FAILED', message)
}

function parseIso(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw migrationError(`${label}无效`)
  return value
}

function deterministicId(...parts: string[]): string {
  return uuidv5(parts.join(':'), MIGRATION_NAMESPACE)
}

function asLegacyDocument(value: unknown, expectedId: string): LegacyDocument {
  assertJsonObject(value, '旧版文档')
  assertUuid(value.id, '旧版文档 ID')
  if (value.id !== expectedId) throw migrationError('旧版文档 ID 与文件名不一致')
  if (value.type !== 'document' && value.type !== 'drawing') throw migrationError('旧版文档类型无效')
  if (typeof value.content !== 'string') throw migrationError('旧版文档内容无效')
  return {
    id: value.id,
    title: normalizeName(value.title, '旧版文档标题'),
    content: value.content,
    type: value.type,
    createdAt: parseIso(value.createdAt, '旧版文档创建时间'),
    updatedAt: parseIso(value.updatedAt, '旧版文档更新时间'),
  }
}

function asLegacyMeta(value: unknown, vaultId: string): LegacyMeta {
  assertJsonObject(value, '旧版知识库元数据')
  assertJsonObject(value.vault, '旧版知识库')
  assertUuid(value.vault.id, '旧版知识库 ID')
  if (value.vault.id !== vaultId) throw migrationError('旧版知识库 ID 不一致')
  return {
    vault: {
      id: value.vault.id,
      name: normalizeName(value.vault.name, '知识库名称'),
      createdAt: parseIso(value.vault.createdAt, '知识库创建时间'),
    },
    documents: Array.isArray(value.documents)
      ? value.documents.filter((item): item is string => typeof item === 'string')
      : undefined,
  }
}

function asLegacyStructure(value: unknown): LegacyStructure {
  assertJsonObject(value, '旧版知识库结构')
  if (value.version !== 1 || !Array.isArray(value.entries)) throw migrationError('旧版知识库结构无效')
  const entries = value.entries.map((raw, index) => {
    assertJsonObject(raw, `旧版结构条目 ${index}`)
    assertUuid(raw.id, '旧版结构条目 ID')
    if (raw.parentId !== null) assertUuid(raw.parentId, '旧版结构父级 ID')
    if (!Number.isInteger(raw.order) || Number(raw.order) < 0) throw migrationError('旧版结构顺序无效')
    if (raw.kind === 'group') {
      return {
        kind: 'group',
        id: raw.id,
        name: normalizeName(raw.name, '旧版分组名称'),
        parentId: raw.parentId,
        order: Number(raw.order),
      } as LegacyGroupEntry
    }
    if (raw.kind === 'document') {
      return {
        kind: 'document',
        id: raw.id,
        parentId: raw.parentId,
        order: Number(raw.order),
      } as LegacyDocumentEntry
    }
    throw migrationError('旧版结构条目类型无效')
  })
  return { version: 1, entries }
}

function decodeEmbeddedCanvas(encoded: string): ExcalidrawScene {
  let serialized: string
  try {
    serialized = decodeURIComponent(Buffer.from(encoded, 'base64').toString('utf8'))
  } catch {
    throw migrationError('内嵌画布编码无效')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw migrationError('内嵌画布 JSON 无效')
  }
  return normalizeLegacyCanvas(parsed)
}

export function normalizeLegacyCanvas(value: unknown): ExcalidrawScene {
  assertJsonObject(value, '旧版画布')
  if (!Array.isArray(value.elements) || !isPlainObject(value.appState) || !isPlainObject(value.files)) {
    throw migrationError('旧版画布根结构无效')
  }
  const scene = {
    ...value,
    type: 'excalidraw',
    version: typeof value.version === 'number' && Number.isInteger(value.version) && value.version > 0
      ? value.version
      : 2,
    source: typeof value.source === 'string' ? value.source : 'localkb-migrated',
  } as unknown as ExcalidrawScene
  assertExcalidrawScene(scene)
  return scene
}

function parseMindMap(value: unknown): MindMapData {
  if (typeof value !== 'string') throw migrationError('思维导图数据无效')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw migrationError('思维导图 JSON 无效')
  }
  assertJsonObject(parsed, '旧版思维导图封装')
  const data = parsed.data
  assertMindMapData(data)
  return data
}

function decodeDataUrl(source: string): { extension: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));(?:charset=[^;,]+;)?(base64)?,([\s\S]*)$/i.exec(source)
  if (!match) return null
  const mime = match[1].toLowerCase()
  let bytes: Uint8Array
  try {
    bytes = match[2]
      ? new Uint8Array(Buffer.from(match[3], 'base64'))
      : new Uint8Array(Buffer.from(decodeURIComponent(match[3]), 'utf8'))
  } catch {
    throw migrationError('图片 data URL 无法解码')
  }
  const extension = mime === 'image/jpeg'
    ? 'jpg'
    : mime === 'image/svg+xml' ? 'svg' : mime.slice('image/'.length)
  return { extension, bytes }
}

function localImagePath(source: string): string | null {
  if (source.startsWith('file://')) {
    try {
      return fileURLToPath(source)
    } catch {
      throw migrationError('本地图片 URL 无效')
    }
  }
  return path.isAbsolute(source) ? source : null
}

function extensionForLocalImage(target: string): string {
  const extension = path.extname(target).slice(1).toLowerCase()
  if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) {
    throw migrationError('本地图片格式不受支持')
  }
  return extension === 'jpeg' ? 'jpg' : extension
}

function referenceAttrs(
  source: JsonObject | undefined,
  idKey: 'canvasId' | 'mindmapId' | 'assetId',
  id: string,
): JsonObject {
  const attrs: JsonObject = { [idKey]: id }
  if (typeof source?.width === 'number' || typeof source?.width === 'string') attrs.width = source.width
  if (source?.textAlign === 'left' || source?.textAlign === 'center' || source?.textAlign === 'right') {
    attrs.textAlign = source.textAlign
  }
  return attrs
}

async function convertLegacyDocument(
  vaultId: string,
  legacy: LegacyDocument,
  fileSystem: FileSystemApi,
): Promise<ConvertedDocument> {
  let parsed: unknown
  try {
    parsed = JSON.parse(legacy.content)
  } catch {
    throw migrationError('旧版 TipTap 内容无法解析')
  }
  assertTipTapDocument(parsed, { allowUnknownTypes: true })
  const document = structuredClone(parsed)
  const canvases: ConvertedDocument['canvases'] = []
  const mindMaps: ConvertedDocument['mindMaps'] = []
  const assets: ConvertedAsset[] = []
  const warnings: MigrationIssue[] = []
  let remoteImages = 0
  let preservedLegacyNodes = 0

  const convertNode = async (node: TipTapNode, route: string): Promise<TipTapNode> => {
    const children = await Promise.all((node.content ?? []).map(
      (child, index) => convertNode(child, `${route}.${index}`),
    ))
    const current: TipTapNode = { ...node, ...(node.content ? { content: children } : {}) }
    if (
      current.type === 'image' && typeof current.attrs?.alt === 'string' &&
      current.attrs.alt.startsWith('canvas-') && typeof current.attrs.title === 'string'
    ) {
      try {
        const id = deterministicId(vaultId, legacy.id, 'canvas', route)
        canvases.push({ id, value: decodeEmbeddedCanvas(current.attrs.title) })
        return { type: 'canvasReference', attrs: referenceAttrs(current.attrs, 'canvasId', id) }
      } catch (error) {
        preservedLegacyNodes += 1
        warnings.push({
          severity: 'warning',
          code: 'UNRECOGNIZED_EMBEDDED_CANVAS',
          scope: 'canvas',
          documentId: legacy.id,
          message: error instanceof Error ? error.message : '内嵌画布无法识别，已保留原节点',
        })
        return current
      }
    }
    if (String(current.type) === 'mindmap' && current.attrs?.data !== undefined) {
      try {
        const id = deterministicId(vaultId, legacy.id, 'mindmap', route)
        mindMaps.push({ id, value: parseMindMap(current.attrs.data) })
        return { type: 'mindmapReference', attrs: referenceAttrs(current.attrs, 'mindmapId', id) }
      } catch (error) {
        preservedLegacyNodes += 1
        warnings.push({
          severity: 'warning',
          code: 'UNRECOGNIZED_MINDMAP',
          scope: 'mindmap',
          documentId: legacy.id,
          message: error instanceof Error ? error.message : '思维导图无法识别，已保留原节点',
        })
        return current
      }
    }
    if (current.type === 'image' && typeof current.attrs?.src === 'string') {
      const source = current.attrs.src
      if (/^https?:\/\//i.test(source)) {
        remoteImages += 1
        return current
      }
      const data = decodeDataUrl(source)
      const local = data ? null : localImagePath(source)
      if (!data && !local) return current
      try {
        const id = deterministicId(vaultId, legacy.id, 'asset', route)
        const converted = data ?? {
          extension: extensionForLocalImage(local!),
          bytes: new Uint8Array(await fileSystem.readFile(local!) as Buffer),
        }
        assets.push({ id, ...converted })
        return { type: 'assetImage', attrs: referenceAttrs(current.attrs, 'assetId', id) }
      } catch (error) {
        throw migrationError(error instanceof Error ? error.message : '本地图片转换失败')
      }
    }
    return current
  }

  const converted = await convertNode(document, 'root') as TipTapDocument
  let counter = 0
  const normalized = normalizeDocumentNodeIds(converted, () => (
    deterministicId(vaultId, legacy.id, 'node', String(counter++))
  ))
  return {
    document: normalized,
    canvases,
    mindMaps,
    assets,
    remoteImages,
    preservedLegacyNodes,
    warnings,
  }
}

function treeFromLegacy(
  structure: LegacyStructure | null,
  documents: LegacyDocument[],
): VaultTreeV2 {
  const byId = new Map(documents.map((document) => [document.id, document]))
  const entries: TreeEntryV2[] = []
  if (structure) {
    for (const entry of structure.entries) {
      if (entry.kind === 'group') {
        entries.push({ ...entry, kind: 'group' })
      } else {
        const document = byId.get(entry.id)
        if (!document) continue
        entries.push({
          kind: 'content',
          id: document.id,
          contentType: document.type === 'drawing' ? 'canvas' : 'document',
          title: document.title,
          parentId: entry.parentId,
          order: entry.order,
          createdAt: document.createdAt,
          metadataUpdatedAt: document.updatedAt,
        })
        byId.delete(document.id)
      }
    }
  }
  const remaining = [...byId.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )
  const rootOrder = entries.filter((entry) => entry.parentId === null).length
  remaining.forEach((document, index) => entries.push({
    kind: 'content',
    id: document.id,
    contentType: document.type === 'drawing' ? 'canvas' : 'document',
    title: document.title,
    parentId: null,
    order: rootOrder + index,
    createdAt: document.createdAt,
    metadataUpdatedAt: document.updatedAt,
  }))
  return validateAndNormalizeTree({ schemaVersion: 2, entries })
}

export class VaultMigrator {
  constructor(
    private readonly store: FileKnowledgeStore,
    private readonly fileSystem: FileSystemApi = nodeFs,
  ) {}

  private async readLegacyVault(vaultId: string): Promise<LegacyVaultData> {
    assertUuid(vaultId, '知识库 ID')
    const vaultPath = this.store.paths.vault(vaultId)
    const metaPath = this.store.paths.legacyMeta(vaultId)
    let totalBytes = 0
    const readJson = async (target: string): Promise<unknown> => {
      const raw = await this.fileSystem.readFile(target, 'utf8')
      totalBytes += Buffer.byteLength(String(raw))
      return JSON.parse(String(raw)) as unknown
    }
    let meta: LegacyMeta
    try {
      meta = asLegacyMeta(await readJson(metaPath), vaultId)
    } catch (error) {
      throw migrationError(error instanceof Error ? error.message : '旧版知识库元数据读取失败')
    }

    let structure: LegacyStructure | null = null
    const structurePath = resolveInside(vaultPath, 'structure.json')
    if (await this.store.exists(structurePath)) {
      try {
        structure = asLegacyStructure(await readJson(structurePath))
      } catch (error) {
        throw migrationError(error instanceof Error ? error.message : '旧版结构读取失败')
      }
    }

    const documentsPath = resolveInside(vaultPath, 'documents')
    const names = await this.fileSystem.readdir(documentsPath) as string[]
    const documents: LegacyDocument[] = []
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const id = name.slice(0, -'.json'.length)
      try {
        assertUuid(id, '旧版文档文件名')
        documents.push(asLegacyDocument(await readJson(resolveInside(documentsPath, name)), id))
      } catch (error) {
        throw migrationError(error instanceof Error ? error.message : '旧版文档读取失败')
      }
    }
    return { meta, structure, documents, totalBytes }
  }

  async dryRun(vaultId: string): Promise<MigrationInventory> {
    const inventory: MigrationInventory = {
      vaultId,
      sourceVersion: 'unknown',
      totalBytes: 0,
      topLevelDocuments: 0,
      topLevelCanvases: 0,
      groups: 0,
      embeddedCanvases: 0,
      embeddedMindMaps: 0,
      ownedAssets: 0,
      ownedAssetBytes: 0,
      remoteImages: 0,
      preservedLegacyNodes: 0,
      issues: [],
      canMigrate: false,
    }
    if (await this.store.exists(this.store.paths.vaultMeta(vaultId))) {
      inventory.sourceVersion = 2
      inventory.issues.push({
        severity: 'warning', code: 'ALREADY_V2', scope: 'vault', message: '知识库已经是版本 2',
      })
      return inventory
    }
    let legacy: LegacyVaultData
    try {
      legacy = await this.readLegacyVault(vaultId)
      inventory.sourceVersion = 1
      inventory.totalBytes = legacy.totalBytes
      inventory.groups = legacy.structure?.entries.filter((entry) => entry.kind === 'group').length ?? 0
    } catch (error) {
      inventory.issues.push({
        severity: 'error', code: 'INVALID_LEGACY_VAULT', scope: 'vault',
        message: error instanceof Error ? error.message : '旧版知识库读取失败',
      })
      return inventory
    }

    for (const legacyDocument of legacy.documents) {
      if (legacyDocument.type === 'drawing') {
        inventory.topLevelCanvases += 1
        try {
          normalizeLegacyCanvas(JSON.parse(legacyDocument.content))
        } catch (error) {
          inventory.issues.push({
            severity: 'error', code: 'INVALID_TOP_LEVEL_CANVAS', scope: 'canvas',
            documentId: legacyDocument.id,
            message: error instanceof Error ? error.message : '顶层画布无法转换',
          })
        }
        continue
      }
      inventory.topLevelDocuments += 1
      try {
        const converted = await convertLegacyDocument(
          vaultId, legacyDocument, this.fileSystem,
        )
        inventory.embeddedCanvases += converted.canvases.length
        inventory.embeddedMindMaps += converted.mindMaps.length
        inventory.ownedAssets += converted.assets.length
        inventory.ownedAssetBytes += converted.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0)
        inventory.remoteImages += converted.remoteImages
        inventory.preservedLegacyNodes += converted.preservedLegacyNodes
        inventory.issues.push(...converted.warnings)
      } catch (error) {
        inventory.issues.push({
          severity: 'error', code: 'INVALID_DOCUMENT', scope: 'document',
          documentId: legacyDocument.id,
          message: error instanceof Error ? error.message : '文档无法转换',
        })
      }
    }
    inventory.canMigrate = !inventory.issues.some((issue) => issue.severity === 'error')
    return inventory
  }

  async stage(vaultId: string): Promise<StagedMigration> {
    const inventory = await this.dryRun(vaultId)
    if (!inventory.canMigrate) throw migrationError('dry-run 未通过，不能构建迁移暂存区')
    const legacy = await this.readLegacyVault(vaultId)
    const stagePath = this.store.paths.migrationStage(vaultId)
    await this.fileSystem.rm(stagePath, { recursive: true, force: true })
    const stagingStore = new FileKnowledgeStore(this.store.paths.stagingRoot, this.fileSystem)
    const vault: VaultV2 = {
      schemaVersion: 2,
      id: legacy.meta.vault.id,
      name: legacy.meta.vault.name,
      createdAt: legacy.meta.vault.createdAt,
    }
    const tree = treeFromLegacy(legacy.structure, legacy.documents)
    await stagingStore.writeVault(vault)
    await stagingStore.writeTree(vaultId, tree)

    for (const legacyDocument of legacy.documents) {
      if (legacyDocument.type === 'drawing') {
        const scene = normalizeLegacyCanvas(JSON.parse(legacyDocument.content))
        await stagingStore.writeCanvas(vaultId, legacyDocument.id, scene)
        await stagingStore.setMtime(
          stagingStore.paths.canvasFile(vaultId, legacyDocument.id), legacyDocument.updatedAt,
        )
        continue
      }
      const converted = await convertLegacyDocument(vaultId, legacyDocument, this.fileSystem)
      await stagingStore.writeDocument(vaultId, legacyDocument.id, converted.document)
      for (const canvas of converted.canvases) {
        await stagingStore.writeCanvas(vaultId, canvas.id, canvas.value, legacyDocument.id)
      }
      for (const mindMap of converted.mindMaps) {
        await stagingStore.writeMindMap(vaultId, legacyDocument.id, mindMap.id, mindMap.value)
      }
      for (const asset of converted.assets) {
        await stagingStore.writeAsset(
          vaultId, legacyDocument.id, asset.id, asset.extension, asset.bytes,
        )
      }
      await stagingStore.setMtime(
        stagingStore.paths.documentFile(vaultId, legacyDocument.id), legacyDocument.updatedAt,
      )
    }
    await this.validateStage(vaultId, inventory)
    await stagingStore.atomicWriteJson(
      this.store.paths.migrationMarker(vaultId),
      {
        schemaVersion: 2,
        vaultId,
        completedAt: new Date().toISOString(),
        counts: {
          documents: inventory.topLevelDocuments,
          canvases: inventory.topLevelCanvases,
          embeddedCanvases: inventory.embeddedCanvases,
          embeddedMindMaps: inventory.embeddedMindMaps,
          assets: inventory.ownedAssets,
        },
      },
    )
    return { vaultId, stagePath, inventory }
  }

  async validateStage(vaultId: string, expected?: MigrationInventory): Promise<void> {
    const stagingStore = new FileKnowledgeStore(this.store.paths.stagingRoot, this.fileSystem)
    const vault = await stagingStore.readVault(vaultId)
    if (vault.id !== vaultId) throw migrationError('暂存知识库 ID 不一致')
    const tree = await stagingStore.readTree(vaultId)
    let documents = 0
    let canvases = 0
    let embeddedCanvases = 0
    let embeddedMindMaps = 0
    let assets = 0
    for (const entry of tree.entries) {
      if (entry.kind !== 'content') continue
      if (entry.contentType === 'canvas') {
        await stagingStore.readCanvas(vaultId, entry.id)
        canvases += 1
        continue
      }
      const document = await stagingStore.readDocument(vaultId, entry.id)
      documents += 1
      for (const reference of collectDocumentReferences(document)) {
        assertUuid(reference.id, '文档资源引用 ID')
        if (reference.type === 'canvas') {
          await stagingStore.readCanvas(vaultId, reference.id, entry.id)
          embeddedCanvases += 1
        } else if (reference.type === 'mindmap') {
          await stagingStore.readMindMap(vaultId, entry.id, reference.id)
          embeddedMindMaps += 1
        } else {
          await stagingStore.findAsset(vaultId, entry.id, reference.id)
          assets += 1
        }
      }
    }
    if (expected && (
      documents !== expected.topLevelDocuments ||
      canvases !== expected.topLevelCanvases ||
      embeddedCanvases !== expected.embeddedCanvases ||
      embeddedMindMaps !== expected.embeddedMindMaps ||
      assets !== expected.ownedAssets
    )) {
      throw migrationError('暂存知识库清单计数不一致')
    }
  }

  async activate(vaultId: string): Promise<ActivatedMigration> {
    if (!(await this.store.completedMigrationStage(vaultId))) {
      throw migrationError('迁移暂存区未完成验证')
    }
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
