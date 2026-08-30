import { createReadStream, createWriteStream, promises as fs } from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { pipeline } from 'stream/promises'
import type { KnowledgeService } from './knowledge/knowledge-service'
import type {
  MarkdownExportBeginRequest,
  MarkdownExportBeginResult,
  MarkdownExportCommitRequest,
  MarkdownExportCommitResult,
  MarkdownExportManifest,
  MarkdownExportManifestEntry,
  MarkdownExportResourceDescriptor,
  MarkdownExportWarning,
} from '../shared/markdown-export-types'
import {
  appendStableSuffix,
  extensionForMimeType,
  isSafeRelativeResourcePath,
  joinPosixPath,
  sanitizeExportFileName,
  stableResourceSuffix,
} from '../shared/markdown-export-utils'
import { assertUuid } from '../shared/knowledge-validation'

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000
const COMPLETED_EXPORT_TTL_MS = 30 * 60 * 1000
const MAX_MARKDOWN_BYTES = 64 * 1024 * 1024
const MAX_GENERATED_RESOURCE_BYTES = 32 * 1024 * 1024
const MAX_GENERATED_BUNDLE_BYTES = 128 * 1024 * 1024
const MAX_WORKSPACE_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

type WorkspaceResource = { sourcePath: string; size: number }

interface ExportSession {
  exportId: string
  expiresAt: number
  targetMarkdownPath: string
  targetAssetsPath: string
  manifest: MarkdownExportManifest
  workspaceResources: Map<string, WorkspaceResource>
  generatedResourceKeys: Set<string>
  initialWarnings: MarkdownExportWarning[]
  expiryTimer: NodeJS.Timeout
}

export interface MarkdownExportDialogAdapter {
  chooseTarget(defaultFileName: string): Promise<string | null>
  confirmReplace(markdownPath: string, assetsPath: string): Promise<boolean>
  revealTarget(markdownPath: string): void
}

export interface MarkdownExportServiceOptions {
  sessionTtlMs?: number
  now?: () => number
  limits?: Partial<MarkdownExportLimits>
}

export interface MarkdownExportLimits {
  markdownBytes: number
  generatedResourceBytes: number
  generatedBundleBytes: number
  workspaceBundleBytes: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '资源不可用'
}

function warningFor(
  descriptor: MarkdownExportResourceDescriptor,
  message: string,
): MarkdownExportWarning {
  return {
    resourceKey: descriptor.resourceKey,
    nodeIds: descriptor.nodeIds,
    kind: descriptor.kind,
    label: descriptor.label,
    message,
  }
}

function normalizeTarget(selectedPath: string): string {
  const parsed = path.parse(path.resolve(selectedPath))
  const rawBase = parsed.ext.toLowerCase() === '.md' ? parsed.name : parsed.base
  return path.join(parsed.dir, `${sanitizeExportFileName(rawBase, '文档')}.md`)
}

function categoryFor(kind: MarkdownExportResourceDescriptor['kind']): string | null {
  if (kind === 'canvas') return 'canvases'
  if (kind === 'mindmap') return 'mindmaps'
  if (kind === 'attachment') return 'attachments'
  if (kind === 'assetImage' || kind === 'dataImage') return 'images'
  return null
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PNG_SIGNATURE.byteLength && PNG_SIGNATURE.every(
    (value, index) => bytes[index] === value,
  )
}

function generatedSignatureMatches(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'image/png') return isPng(bytes)
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8
  if (mimeType === 'image/gif') {
    const header = String.fromCharCode(...bytes.slice(0, 6))
    return header === 'GIF87a' || header === 'GIF89a'
  }
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  if (mimeType === 'image/svg+xml') {
    const header = new TextDecoder().decode(bytes.slice(0, 2048)).replace(/^\uFEFF/, '').trimStart()
    return /^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(header)
  }
  return false
}

function assertDescriptor(descriptor: MarkdownExportResourceDescriptor): void {
  if (!descriptor || typeof descriptor !== 'object' ||
    typeof descriptor.resourceKey !== 'string' || descriptor.resourceKey.length > 200 ||
    typeof descriptor.label !== 'string' || !descriptor.label.trim() || descriptor.label.length > 500 ||
    !Array.isArray(descriptor.nodeIds) || descriptor.nodeIds.length === 0 || descriptor.nodeIds.length > 10000) {
    throw new Error('Markdown 导出资源描述无效')
  }
  descriptor.nodeIds.forEach((nodeId) => assertUuid(nodeId, 'Markdown 导出节点 ID'))
  if (descriptor.kind === 'canvas') {
    assertUuid(descriptor.canvasId, '画布 ID')
    if (descriptor.resourceKey !== `canvas:${descriptor.canvasId}`) throw new Error('画布资源 key 无效')
  } else if (descriptor.kind === 'mindmap') {
    assertUuid(descriptor.mindmapId, '思维导图 ID')
    if (descriptor.resourceKey !== `mindmap:${descriptor.mindmapId}`) throw new Error('思维导图资源 key 无效')
  } else if (descriptor.kind === 'assetImage') {
    assertUuid(descriptor.assetId, '附件 ID')
    if (descriptor.resourceKey !== `asset-image:${descriptor.assetId}`) throw new Error('图片资源 key 无效')
  } else if (descriptor.kind === 'attachment') {
    assertUuid(descriptor.assetId, '附件 ID')
    if (descriptor.resourceKey !== `attachment:${descriptor.assetId}` ||
      typeof descriptor.fileName !== 'string' || !descriptor.fileName.trim() || descriptor.fileName.length > 255 ||
      typeof descriptor.mimeType !== 'string' || !descriptor.mimeType.trim() ||
      typeof descriptor.size !== 'number' || !Number.isSafeInteger(descriptor.size) || descriptor.size < 0) {
      throw new Error('附件资源描述无效')
    }
  } else if (descriptor.kind === 'documentReference') {
    assertUuid(descriptor.referencedDocumentId, '引用文档 ID')
    if (descriptor.resourceKey !== `document:${descriptor.referencedDocumentId}`) {
      throw new Error('文档引用资源 key 无效')
    }
  } else if (descriptor.kind === 'dataImage') {
    if (!/^data-image:[a-f0-9]{8}$/i.test(descriptor.resourceKey) ||
      !/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/i.test(descriptor.mimeType)) {
      throw new Error('data URL 图片资源描述无效')
    }
  } else if (descriptor.kind === 'unsupportedImage') {
    if (!descriptor.resourceKey.startsWith('unsupported-image:') ||
      typeof descriptor.reason !== 'string' || !descriptor.reason.trim()) {
      throw new Error('不支持图片资源描述无效')
    }
  } else {
    throw new Error('Markdown 导出资源类型无效')
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function removeIfPresent(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true })
}

export class MarkdownExportService {
  private readonly sessions = new Map<string, ExportSession>()
  private readonly completedExports = new Map<string, {
    markdownPath: string
    expiresAt: number
    expiryTimer: NodeJS.Timeout
  }>()
  private readonly reservedTargets = new Set<string>()
  private readonly sessionTtlMs: number
  private readonly now: () => number
  private readonly limits: MarkdownExportLimits

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly dialogs: MarkdownExportDialogAdapter,
    options: MarkdownExportServiceOptions = {},
  ) {
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
    this.now = options.now ?? Date.now
    this.limits = {
      markdownBytes: MAX_MARKDOWN_BYTES,
      generatedResourceBytes: MAX_GENERATED_RESOURCE_BYTES,
      generatedBundleBytes: MAX_GENERATED_BUNDLE_BYTES,
      workspaceBundleBytes: MAX_WORKSPACE_BUNDLE_BYTES,
      ...options.limits,
    }
  }

  private cleanupExpiredSessions(): void {
    const now = this.now()
    for (const [exportId, session] of this.sessions) {
      if (session.expiresAt <= now) this.deleteSession(exportId, session)
    }
    for (const [revealId, completed] of this.completedExports) {
      if (completed.expiresAt <= now) this.deleteCompletedExport(revealId, completed)
    }
  }

  private deleteCompletedExport(
    revealId: string,
    completed: { expiryTimer: NodeJS.Timeout },
  ): void {
    clearTimeout(completed.expiryTimer)
    this.completedExports.delete(revealId)
  }

  private rememberCompletedExport(revealId: string, markdownPath: string): void {
    const previous = this.completedExports.get(revealId)
    if (previous) this.deleteCompletedExport(revealId, previous)
    let completed!: { markdownPath: string; expiresAt: number; expiryTimer: NodeJS.Timeout }
    completed = {
      markdownPath,
      expiresAt: this.now() + COMPLETED_EXPORT_TTL_MS,
      expiryTimer: setTimeout(
        () => this.deleteCompletedExport(revealId, completed),
        COMPLETED_EXPORT_TTL_MS,
      ),
    }
    completed.expiryTimer.unref()
    this.completedExports.set(revealId, completed)
  }

  private deleteSession(exportId: string, session: ExportSession): void {
    clearTimeout(session.expiryTimer)
    this.sessions.delete(exportId)
    this.reservedTargets.delete(session.targetMarkdownPath)
  }

  private consumeSession(exportId: string, session: ExportSession): void {
    clearTimeout(session.expiryTimer)
    this.sessions.delete(exportId)
  }

  private relativePath(
    assetDirectoryName: string,
    descriptor: MarkdownExportResourceDescriptor,
    extension?: string,
  ): string | undefined {
    const category = categoryFor(descriptor.kind)
    if (!category) return undefined
    let fileName: string
    if (descriptor.kind === 'attachment') {
      const currentExtension = path.extname(descriptor.fileName).slice(1).toLowerCase()
      const portableName = currentExtension
        ? descriptor.fileName
        : `${descriptor.fileName}.${extension ?? 'bin'}`
      fileName = appendStableSuffix(portableName, descriptor.assetId)
    } else if (descriptor.kind === 'canvas') {
      fileName = `canvas-${stableResourceSuffix(descriptor.canvasId)}.png`
    } else if (descriptor.kind === 'mindmap') {
      fileName = `mindmap-${stableResourceSuffix(descriptor.mindmapId)}.png`
    } else if (descriptor.kind === 'assetImage') {
      fileName = `image-${stableResourceSuffix(descriptor.assetId)}.${extension ?? 'bin'}`
    } else {
      const keyId = descriptor.resourceKey.slice(descriptor.resourceKey.lastIndexOf(':') + 1)
      fileName = `image-${stableResourceSuffix(keyId)}.${extension ?? 'bin'}`
    }
    const relativePath = joinPosixPath(assetDirectoryName, category, fileName)
    if (!isSafeRelativeResourcePath(relativePath)) throw new Error('导出资源路径无效')
    return relativePath
  }

  private async prepareEntry(
    request: MarkdownExportBeginRequest,
    descriptor: MarkdownExportResourceDescriptor,
    assetDirectoryName: string,
    workspaceResources: Map<string, WorkspaceResource>,
    generatedResourceKeys: Set<string>,
  ): Promise<MarkdownExportManifestEntry> {
    const base = {
      resourceKey: descriptor.resourceKey,
      kind: descriptor.kind,
      nodeIds: descriptor.nodeIds,
      label: descriptor.label,
      status: 'ready' as const,
    }
    const { vaultId, documentId } = request.metadata

    if (descriptor.kind === 'canvas') {
      await this.knowledge.getCanvas(vaultId, descriptor.canvasId, documentId)
      generatedResourceKeys.add(descriptor.resourceKey)
      return { ...base, mimeType: 'image/png', relativePath: this.relativePath(assetDirectoryName, descriptor) }
    }
    if (descriptor.kind === 'mindmap') {
      await this.knowledge.getMindMap(vaultId, documentId, descriptor.mindmapId)
      generatedResourceKeys.add(descriptor.resourceKey)
      return { ...base, mimeType: 'image/png', relativePath: this.relativePath(assetDirectoryName, descriptor) }
    }
    if (descriptor.kind === 'assetImage' || descriptor.kind === 'attachment') {
      const sourcePath = await this.knowledge.getAssetPath(vaultId, documentId, descriptor.assetId)
      const stat = await fs.stat(sourcePath)
      if (!stat.isFile()) throw new Error('工作区资源不是普通文件')
      if (descriptor.kind === 'attachment' && stat.size !== descriptor.size) {
        throw new Error('附件大小与文档记录不一致')
      }
      const actualExtension = path.extname(sourcePath).slice(1).toLowerCase() ||
        extensionForMimeType(descriptor.kind === 'attachment' ? descriptor.mimeType : '', 'bin')
      if (descriptor.kind === 'attachment') {
        const expectedExtension = extensionForMimeType(descriptor.mimeType, actualExtension)
        if (expectedExtension !== actualExtension) throw new Error('附件类型与工作区文件不一致')
        const fileNameExtension = path.extname(descriptor.fileName).slice(1).toLowerCase()
        if (fileNameExtension && fileNameExtension !== actualExtension) {
          throw new Error('附件文件名与工作区文件类型不一致')
        }
      }
      workspaceResources.set(descriptor.resourceKey, { sourcePath, size: stat.size })
      return {
        ...base,
        mimeType: descriptor.kind === 'attachment' ? descriptor.mimeType : undefined,
        displayName: descriptor.kind === 'attachment' ? descriptor.fileName : descriptor.alt,
        relativePath: this.relativePath(assetDirectoryName, descriptor, actualExtension),
      }
    }
    if (descriptor.kind === 'documentReference') {
      const referenced = await this.knowledge.getDocument(vaultId, descriptor.referencedDocumentId)
      return { ...base, displayName: referenced.title }
    }
    if (descriptor.kind === 'dataImage') {
      const extension = extensionForMimeType(descriptor.mimeType, '')
      if (!extension) throw new Error('不支持的 data URL 图片类型')
      generatedResourceKeys.add(descriptor.resourceKey)
      return {
        ...base,
        mimeType: descriptor.mimeType,
        relativePath: this.relativePath(assetDirectoryName, descriptor, extension),
      }
    }
    throw new Error(descriptor.reason)
  }

  async begin(request: MarkdownExportBeginRequest): Promise<MarkdownExportBeginResult> {
    this.cleanupExpiredSessions()
    assertUuid(request.metadata.vaultId, '知识库 ID')
    assertUuid(request.metadata.documentId, '文档 ID')
    if (!Array.isArray(request.resources) || request.resources.length > 10000 ||
      typeof request.metadata.title !== 'string' || request.metadata.title.length > 1000) {
      throw new Error('Markdown 导出请求无效')
    }
    if (!Number.isFinite(Date.parse(request.metadata.createdAt)) ||
      !Number.isFinite(Date.parse(request.metadata.updatedAt))) {
      throw new Error('Markdown 导出时间无效')
    }
    request.resources.forEach(assertDescriptor)
    const currentDocument = await this.knowledge.getDocument(
      request.metadata.vaultId, request.metadata.documentId,
    )
    if (!request.metadata.title.trim()) request.metadata.title = currentDocument.title

    const defaultName = `${sanitizeExportFileName(request.metadata.title, '文档')}.md`
    const selectedPath = await this.dialogs.chooseTarget(defaultName)
    if (!selectedPath) return { canceled: true }
    const targetMarkdownPath = normalizeTarget(selectedPath)
    if (this.reservedTargets.has(targetMarkdownPath)) throw new Error('该 Markdown 目标正在导出')
    const assetDirectoryName = `${path.basename(targetMarkdownPath, '.md')}.assets`
    const targetAssetsPath = path.join(path.dirname(targetMarkdownPath), assetDirectoryName)
    if (await pathExists(targetMarkdownPath) || await pathExists(targetAssetsPath)) {
      if (!await this.dialogs.confirmReplace(targetMarkdownPath, targetAssetsPath)) {
        return { canceled: true }
      }
    }

    const nodeResources: Record<string, string> = {}
    const resources: Record<string, MarkdownExportManifestEntry> = {}
    const workspaceResources = new Map<string, WorkspaceResource>()
    const generatedResourceKeys = new Set<string>()
    const warnings: MarkdownExportWarning[] = []

    for (const descriptor of request.resources) {
      const existing = resources[descriptor.resourceKey]
      if (existing) {
        if (existing.kind !== descriptor.kind) throw new Error('资源 key 类型冲突')
        descriptor.nodeIds.forEach((nodeId) => { nodeResources[nodeId] = descriptor.resourceKey })
        continue
      }
      for (const nodeId of descriptor.nodeIds) {
        const mapped = nodeResources[nodeId]
        if (mapped && mapped !== descriptor.resourceKey) throw new Error('节点资源映射冲突')
        nodeResources[nodeId] = descriptor.resourceKey
      }
      try {
        resources[descriptor.resourceKey] = await this.prepareEntry(
          request, descriptor, assetDirectoryName, workspaceResources, generatedResourceKeys,
        )
      } catch (error) {
        const message = errorMessage(error)
        resources[descriptor.resourceKey] = {
          resourceKey: descriptor.resourceKey,
          kind: descriptor.kind,
          nodeIds: descriptor.nodeIds,
          label: descriptor.label,
          status: 'failed',
          error: message,
        }
        warnings.push(warningFor(descriptor, message))
      }
    }

    const manifest = { assetDirectoryName, nodeResources, resources }
    const exportId = randomUUID()
    let session!: ExportSession
    session = {
      exportId,
      expiresAt: this.now() + this.sessionTtlMs,
      targetMarkdownPath,
      targetAssetsPath,
      manifest,
      workspaceResources,
      generatedResourceKeys,
      initialWarnings: warnings,
      expiryTimer: setTimeout(() => this.deleteSession(exportId, session), this.sessionTtlMs),
    }
    session.expiryTimer.unref()
    this.sessions.set(exportId, session)
    this.reservedTargets.add(targetMarkdownPath)
    return { canceled: false, exportId, manifest, warnings }
  }

  private validateGeneratedResources(
    session: ExportSession,
    request: MarkdownExportCommitRequest,
  ): Map<string, Uint8Array> {
    const supplied = new Map<string, Uint8Array>()
    let totalBytes = 0
    for (const resource of request.generatedResources) {
      if (supplied.has(resource.resourceKey)) throw new Error('生成资源 key 重复')
      if (!session.generatedResourceKeys.has(resource.resourceKey)) throw new Error('生成资源 key 未声明')
      const entry = session.manifest.resources[resource.resourceKey]
      if (!entry || entry.status !== 'ready' || entry.mimeType !== resource.mimeType) {
        throw new Error('生成资源与导出清单不一致')
      }
      const bytes = resource.bytes instanceof Uint8Array
        ? resource.bytes
        : Uint8Array.from(resource.bytes as unknown as number[])
      if (bytes.byteLength === 0 || bytes.byteLength > this.limits.generatedResourceBytes) {
        throw new Error('生成资源大小超出限制')
      }
      if ((entry.kind === 'canvas' || entry.kind === 'mindmap') && !isPng(bytes)) {
        throw new Error('画布或思维导图必须为有效 PNG')
      }
      if (!generatedSignatureMatches(resource.mimeType, bytes)) throw new Error('生成资源文件签名无效')
      totalBytes += bytes.byteLength
      if (totalBytes > this.limits.generatedBundleBytes) throw new Error('生成资源总大小超出限制')
      supplied.set(resource.resourceKey, bytes)
    }
    const failedKeys = new Set<string>()
    for (const warning of request.warnings) {
      const entry = session.manifest.resources[warning.resourceKey]
      if (!entry || entry.kind !== warning.kind || entry.label !== warning.label ||
        !warning.message?.trim() || warning.nodeIds.length !== entry.nodeIds.length ||
        warning.nodeIds.some((nodeId, index) => nodeId !== entry.nodeIds[index])) {
        throw new Error('资源 warning 与导出清单不一致')
      }
      failedKeys.add(warning.resourceKey)
    }
    for (const resourceKey of session.generatedResourceKeys) {
      const entry = session.manifest.resources[resourceKey]
      if (entry?.status === 'ready' && !supplied.has(resourceKey) && !failedKeys.has(resourceKey)) {
        throw new Error(`缺少生成资源：${entry.label}`)
      }
    }
    return supplied
  }

  private targetForRelativePath(session: ExportSession, relativePath: string): string {
    if (!isSafeRelativeResourcePath(relativePath)) throw new Error('资源相对路径无效')
    const segments = relativePath.split('/')
    if (segments.shift() !== session.manifest.assetDirectoryName) throw new Error('资源路径越出受管目录')
    const target = path.resolve(session.targetAssetsPath, ...segments)
    const relative = path.relative(session.targetAssetsPath, target)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('资源路径越出受管目录')
    }
    return target
  }

  private async stageBundle(
    session: ExportSession,
    request: MarkdownExportCommitRequest,
    generated: Map<string, Uint8Array>,
    stageRoot: string,
  ): Promise<{ markdownPath: string; assetsPath: string }> {
    const markdownBytes = Buffer.byteLength(request.markdown, 'utf8')
    if (markdownBytes === 0 || markdownBytes > this.limits.markdownBytes) throw new Error('Markdown 正文大小无效')
    const markdownPath = path.join(stageRoot, path.basename(session.targetMarkdownPath))
    const assetsPath = path.join(stageRoot, path.basename(session.targetAssetsPath))
    await fs.mkdir(assetsPath, { recursive: true })
    await Promise.all(['images', 'canvases', 'mindmaps', 'attachments'].map(
      (category) => fs.mkdir(path.join(assetsPath, category), { recursive: true }),
    ))
    await fs.writeFile(markdownPath, request.markdown, { encoding: 'utf8', flag: 'wx' })

    let workspaceBytes = 0
    for (const [resourceKey, workspace] of session.workspaceResources) {
      const entry = session.manifest.resources[resourceKey]
      if (!entry?.relativePath || entry.status !== 'ready') continue
      workspaceBytes += workspace.size
      if (workspaceBytes > this.limits.workspaceBundleBytes) throw new Error('工作区资源总大小超出限制')
      const target = this.targetForRelativePath(session, entry.relativePath)
      const stagedTarget = path.join(assetsPath, path.relative(session.targetAssetsPath, target))
      await fs.mkdir(path.dirname(stagedTarget), { recursive: true })
      await pipeline(createReadStream(workspace.sourcePath), createWriteStream(stagedTarget, { flags: 'wx' }))
    }
    for (const [resourceKey, bytes] of generated) {
      const entry = session.manifest.resources[resourceKey]
      if (!entry?.relativePath || entry.status !== 'ready') throw new Error('生成资源目标缺失')
      const target = this.targetForRelativePath(session, entry.relativePath)
      const stagedTarget = path.join(assetsPath, path.relative(session.targetAssetsPath, target))
      await fs.mkdir(path.dirname(stagedTarget), { recursive: true })
      await fs.writeFile(stagedTarget, bytes, { flag: 'wx' })
    }
    return { markdownPath, assetsPath }
  }

  private async replaceBundle(
    session: ExportSession,
    staged: { markdownPath: string; assetsPath: string },
    backupRoot: string,
  ): Promise<void> {
    const backupMarkdown = path.join(backupRoot, path.basename(session.targetMarkdownPath))
    const backupAssets = path.join(backupRoot, path.basename(session.targetAssetsPath))
    const hadMarkdown = await pathExists(session.targetMarkdownPath)
    const hadAssets = await pathExists(session.targetAssetsPath)
    let installedMarkdown = false
    let installedAssets = false
    try {
      if (hadMarkdown) await fs.rename(session.targetMarkdownPath, backupMarkdown)
      if (hadAssets) await fs.rename(session.targetAssetsPath, backupAssets)
      await fs.rename(staged.markdownPath, session.targetMarkdownPath)
      installedMarkdown = true
      await fs.rename(staged.assetsPath, session.targetAssetsPath)
      installedAssets = true
    } catch (error) {
      if (installedAssets) await removeIfPresent(session.targetAssetsPath)
      if (installedMarkdown) await removeIfPresent(session.targetMarkdownPath)
      if (hadMarkdown && await pathExists(backupMarkdown)) {
        await fs.rename(backupMarkdown, session.targetMarkdownPath)
      }
      if (hadAssets && await pathExists(backupAssets)) {
        await fs.rename(backupAssets, session.targetAssetsPath)
      }
      throw error
    }
  }

  async commit(request: MarkdownExportCommitRequest): Promise<MarkdownExportCommitResult> {
    this.cleanupExpiredSessions()
    const session = this.sessions.get(request.exportId)
    if (!session) throw new Error('Markdown 导出会话不存在或已失效')
    this.consumeSession(request.exportId, session)
    let stageRoot: string | null = null
    let backupRoot: string | null = null
    try {
      const generated = this.validateGeneratedResources(session, request)
      const parentDirectory = path.dirname(session.targetMarkdownPath)
      await fs.mkdir(parentDirectory, { recursive: true })
      stageRoot = await fs.mkdtemp(path.join(parentDirectory, '.localkb-md-export-'))
      backupRoot = await fs.mkdtemp(path.join(parentDirectory, '.localkb-md-backup-'))
      const staged = await this.stageBundle(session, request, generated, stageRoot)
      await this.replaceBundle(session, staged, backupRoot)
      this.rememberCompletedExport(request.exportId, session.targetMarkdownPath)
      const warnings = [...session.initialWarnings, ...request.warnings]
      return {
        success: true,
        revealId: request.exportId,
        warningCount: warnings.length,
        warnings,
      }
    } finally {
      this.reservedTargets.delete(session.targetMarkdownPath)
      if (stageRoot) await removeIfPresent(stageRoot).catch(() => undefined)
      if (backupRoot) {
        const backupEntries = await fs.readdir(backupRoot).catch(() => ['preserve-backup'])
        if (backupEntries.length === 0) await removeIfPresent(backupRoot).catch(() => undefined)
      }
    }
  }

  reveal(revealId: string): boolean {
    this.cleanupExpiredSessions()
    assertUuid(revealId, 'Markdown 导出定位 ID')
    const completed = this.completedExports.get(revealId)
    if (!completed) throw new Error('Markdown 导出位置不存在或已失效')
    this.dialogs.revealTarget(completed.markdownPath)
    return true
  }
}
