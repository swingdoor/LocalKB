import * as path from 'path'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import type {
  AssetManifest,
  IntegrityIssue,
  JsonValue,
  VaultIntegrityReport,
  VaultTreeV3,
} from '../../shared/knowledge-types'
import { collectDocumentReferences, collectInternalDocumentReferences } from '../../shared/knowledge-operations'
import { FileKnowledgeStore } from './file-knowledge-store'

interface IntegrityOptions {
  fullAssetHash?: boolean
}

function relative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/')
}

async function names(directory: string): Promise<string[]> {
  try { return await fs.readdir(directory) }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

export async function inspectVaultIntegrity(
  store: FileKnowledgeStore,
  vaultId: string,
  options: IntegrityOptions = {},
): Promise<VaultIntegrityReport> {
  const root = store.paths.vault(vaultId)
  const issues: IntegrityIssue[] = []
  const issue = (value: IntegrityIssue): void => { issues.push(value) }
  let tree: VaultTreeV3 | null = null
  let manifest: AssetManifest | null = null
  try { await store.readVault(vaultId) }
  catch (error) {
    issue({
      code: error && typeof error === 'object' && 'code' in error && error.code === 'UNSUPPORTED_VERSION'
        ? 'UNSUPPORTED_VERSION' : 'MALFORMED_METADATA',
      severity: 'error', message: '知识库元数据无效', relativePath: 'vault.json',
    })
  }
  try { tree = await store.readTree(vaultId) }
  catch {
    issue({ code: 'INVALID_TREE', severity: 'error', message: '知识库树无效', relativePath: 'tree.json' })
  }
  try { manifest = await store.readAssetManifest(vaultId) }
  catch {
    issue({
      code: 'INVALID_ASSET_METADATA', severity: 'error', message: '附件清单无效',
      relativePath: 'assets/manifest.json',
    })
  }

  if (tree) {
    try {
      const rawValue = await store.readJson<JsonValue>(
        store.paths.tree(vaultId), '知识库树',
      )
      const raw = rawValue as Record<string, unknown> & { entries?: unknown[] }
      const siblings = new Map<string, number[]>()
      for (const entry of raw.entries ?? []) {
        if (!entry || typeof entry !== 'object' || !('order' in entry) || !('parentId' in entry)) continue
        const record = entry as { order: unknown; parentId: unknown }
        if (!Number.isInteger(record.order)) continue
        const key = record.parentId === null ? '__root__' : String(record.parentId)
        const orders = siblings.get(key) ?? []
        orders.push(Number(record.order))
        siblings.set(key, orders)
      }
      if ([...siblings.values()].some((orders) => (
        [...orders].sort((left, right) => left - right).some((order, index) => order !== index)
      ))) {
        issue({
          code: 'INVALID_TREE', severity: 'error', message: '同级树条目顺序不连续或重复',
          relativePath: 'tree.json',
        })
      }
    } catch {
      // The main tree read above already reports malformed JSON and schema errors.
    }
  }

  const documentNames = await names(store.paths.documents(vaultId))
  const canvasNames = await names(store.paths.canvases(vaultId))
  const mindMapNames = await names(store.paths.mindMaps(vaultId))
  const fileIds = (values: string[], type: 'document' | 'canvas' | 'mindmap'): Set<string> => {
    const result = new Set<string>()
    for (const name of values) {
      const match = /^([0-9a-f-]{36})\.json$/i.exec(name)
      if (!match) {
        issue({
          code: 'INVALID_RESOURCE_NAME', severity: 'error', message: `${type} 资源文件名无效`,
          relativePath: relative(root, path.join(
            type === 'document' ? store.paths.documents(vaultId)
              : type === 'canvas' ? store.paths.canvases(vaultId) : store.paths.mindMaps(vaultId),
            name,
          )), resourceType: type,
        })
        continue
      }
      result.add(match[1])
    }
    return result
  }
  const documents = fileIds(documentNames, 'document')
  const canvases = fileIds(canvasNames, 'canvas')
  const mindmaps = fileIds(mindMapNames, 'mindmap')
  const assets = new Set(Object.keys(manifest?.assets ?? {}))
  for (const name of await names(store.paths.assets(vaultId))) {
    if (name === 'manifest.json') continue
    const match = /^([0-9a-f-]{36})\.([a-z0-9]{1,16})$/i.exec(name)
    if (!match) {
      issue({
        code: 'INVALID_RESOURCE_NAME', severity: 'error', message: '附件资源文件名无效',
        relativePath: `assets/${name}`, resourceType: 'asset',
      })
      continue
    }
    const entry = manifest?.assets[match[1]]
    if (!entry) {
      issue({
        code: 'UNMANIFESTED_ASSET', severity: 'error', message: '附件字节文件未登记到资产清单',
        relativePath: `assets/${name}`, resourceType: 'asset', resourceId: match[1],
      })
    } else if (entry.extension !== match[2].toLowerCase()) {
      issue({
        code: 'INVALID_ASSET_METADATA', severity: 'error', message: '附件扩展名与资产清单不一致',
        relativePath: `assets/${name}`, resourceType: 'asset', resourceId: match[1],
      })
    }
  }
  const identity = new Map<string, string>()
  for (const [type, ids] of [
    ['document', documents], ['canvas', canvases], ['mindmap', mindmaps], ['asset', assets],
  ] as const) {
    for (const id of ids) {
      const previous = identity.get(id)
      if (previous) issue({
        code: 'DUPLICATE_RESOURCE_ID', severity: 'error',
        message: `资源 ID 同时用于 ${previous} 和 ${type}`, resourceType: type, resourceId: id,
      })
      else identity.set(id, type)
    }
  }

  const referenced = new Set<string>()
  const documentIds = new Set(documents)
  for (const id of documents) {
    try {
      const document = await store.readDocument(vaultId, id)
      for (const reference of collectDocumentReferences(document)) {
        referenced.add(`${reference.type}:${reference.id}`)
        const target = reference.type === 'canvas' ? canvases
          : reference.type === 'mindmap' ? mindmaps : assets
        if (!target.has(reference.id)) issue({
          code: 'MISSING_REFERENCE', severity: 'error', message: '文档资源引用不存在',
          resourceType: reference.type, resourceId: reference.id,
          relativePath: `documents/${id}.json`,
        })
      }
      for (const reference of collectInternalDocumentReferences(document)) {
        if (!documentIds.has(reference.documentId)) issue({
          code: 'MISSING_REFERENCE', severity: 'error', message: '内部文档引用不存在',
          resourceType: 'document', resourceId: reference.documentId,
          relativePath: `documents/${id}.json`,
        })
      }
    } catch {
      issue({
        code: 'INVALID_NATIVE_DATA', severity: 'error', message: 'TipTap 文档数据无效',
        resourceType: 'document', resourceId: id, relativePath: `documents/${id}.json`,
      })
    }
  }
  for (const id of canvases) {
    try { await store.readCanvas(vaultId, id) }
    catch { issue({
      code: 'INVALID_NATIVE_DATA', severity: 'error', message: 'Excalidraw 数据无效',
      resourceType: 'canvas', resourceId: id, relativePath: `canvases/${id}.json`,
    }) }
  }
  for (const id of mindmaps) {
    try { await store.readMindMap(vaultId, id) }
    catch { issue({
      code: 'INVALID_NATIVE_DATA', severity: 'error', message: 'MindElixir 数据无效',
      resourceType: 'mindmap', resourceId: id, relativePath: `mindmaps/${id}.json`,
    }) }
  }

  const topLevel = new Set<string>()
  for (const entry of tree?.entries ?? []) {
    if (entry.kind !== 'content') continue
    topLevel.add(`${entry.contentType}:${entry.id}`)
    const target = entry.contentType === 'document' ? documents
      : entry.contentType === 'canvas' ? canvases : mindmaps
    if (!target.has(entry.id)) issue({
      code: 'MISSING_BACKING_RESOURCE', severity: 'error', message: '树条目缺少原生资源文件',
      resourceType: entry.contentType, resourceId: entry.id, relativePath: 'tree.json',
    })
  }
  let unreferencedResources = 0
  for (const [type, ids] of [
    ['canvas', canvases], ['mindmap', mindmaps], ['asset', assets],
  ] as const) {
    for (const id of ids) {
      if (topLevel.has(`${type}:${id}`) || referenced.has(`${type}:${id}`)) continue
      unreferencedResources += 1
      issue({
        code: 'UNREFERENCED_RESOURCE', severity: 'warning', message: '资源当前未被引用',
        resourceType: type, resourceId: id,
      })
    }
  }

  for (const [id, entry] of Object.entries(manifest?.assets ?? {})) {
    const target = store.paths.assetFile(vaultId, id, entry.extension)
    try {
      const value = await fs.readFile(target)
      if (value.byteLength !== entry.size) issue({
        code: 'ASSET_SIZE_MISMATCH', severity: 'error', message: '附件大小与清单不一致',
        resourceType: 'asset', resourceId: id, relativePath: relative(root, target),
      })
      if (options.fullAssetHash && createHash('sha256').update(value).digest('hex') !== entry.sha256) {
        issue({
          code: 'ASSET_HASH_MISMATCH', severity: 'error', message: '附件哈希与清单不一致',
          resourceType: 'asset', resourceId: id, relativePath: relative(root, target),
        })
      }
    } catch {
      issue({
        code: 'MISSING_BACKING_RESOURCE', severity: 'error', message: '附件字节文件不存在',
        resourceType: 'asset', resourceId: id, relativePath: relative(root, target),
      })
    }
  }

  const operationRoot = path.join(root, '.operations')
  for (const state of await names(operationRoot)) {
    if (state !== 'staging' && state !== 'trash' && state !== 'assets') issue({
      code: 'INTERRUPTED_OPERATION', severity: 'warning', message: '发现未知操作状态',
      relativePath: `.operations/${state}`,
    })
    if (state === 'staging' || state === 'trash' || state === 'assets') {
      for (const name of await names(path.join(operationRoot, state))) issue({
        code: 'INTERRUPTED_OPERATION', severity: 'warning', message: '发现尚未完成的存储操作',
        relativePath: `.operations/${state}/${name}`,
      })
    }
  }
  const allowedRoot = new Set([
    'vault.json', 'tree.json', 'documents', 'canvases', 'mindmaps', 'assets', '.operations',
  ])
  for (const name of await names(root)) {
    if (!allowedRoot.has(name)) issue({
      code: 'UNKNOWN_STORAGE_ENTRY', severity: 'warning', message: '发现未知存储条目', relativePath: name,
    })
  }

  return {
    vaultId, healthy: !issues.some((item) => item.severity === 'error'),
    fullAssetHash: Boolean(options.fullAssetHash),
    counts: {
      documents: documents.size, canvases: canvases.size, mindmaps: mindmaps.size,
      assets: assets.size, references: referenced.size, unreferencedResources,
    },
    issues,
  }
}
