import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeService } from './knowledge/knowledge-service'
import type {
  MarkdownExportBeginRequest,
  MarkdownExportResourceDescriptor,
} from '../shared/markdown-export-types'
import { MarkdownExportService, type MarkdownExportServiceOptions } from './markdown-export-service'

const VAULT_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000002'
const NODE_ID = '00000000-0000-4000-8000-000000000003'
const RESOURCE_ID = '00000000-0000-4000-8000-000000000004'
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

function request(resources: MarkdownExportResourceDescriptor[]): MarkdownExportBeginRequest {
  return {
    metadata: {
      vaultId: VAULT_ID,
      documentId: DOCUMENT_ID,
      title: '测试文档',
      createdAt: '2026-08-30T01:02:03.000Z',
      updatedAt: '2026-08-30T04:05:06.000Z',
    },
    resources,
  }
}

describe('MarkdownExportService', () => {
  let tempDirectory: string
  let selectedPath: string | null
  let confirmReplace: any
  let revealTarget: any
  let knowledge: any

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-markdown-test-'))
    selectedPath = path.join(tempDirectory, '测试文档.md')
    confirmReplace = vi.fn(async () => true)
    revealTarget = vi.fn()
    knowledge = {
      getDocument: vi.fn(async () => ({ title: '测试文档' })),
      getCanvas: vi.fn(async () => ({ elements: [], appState: {}, files: {} })),
      getMindMap: vi.fn(async () => ({ nodeData: { id: 'root', topic: 'Root' } })),
      getAssetPath: vi.fn(),
    }
  })

  afterEach(async () => {
    await fs.rm(tempDirectory, { recursive: true, force: true })
  })

  function service(options: MarkdownExportServiceOptions = {}) {
    return new MarkdownExportService(knowledge as unknown as KnowledgeService, {
      chooseTarget: vi.fn(async () => selectedPath),
      confirmReplace,
      revealTarget,
    }, options)
  }

  it('keeps the final absolute path in main and commits PNG resources once', async () => {
    const exporter = service()
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'canvas', resourceKey: `canvas:${RESOURCE_ID}`, canvasId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '架构图',
    }
    const begin = await exporter.begin(request([descriptor]))
    expect(begin).toMatchObject({ canceled: false })
    expect(JSON.stringify(begin)).not.toContain(tempDirectory)
    if (begin.canceled) throw new Error('unexpected cancellation')
    const entry = begin.manifest.resources[descriptor.resourceKey]
    const markdown = `![架构图](<./${entry.relativePath}>)\n`

    const result = await exporter.commit({
      exportId: begin.exportId,
      markdown,
      generatedResources: [{ resourceKey: descriptor.resourceKey, mimeType: 'image/png', bytes: PNG }],
      warnings: [],
    })

    expect(result).toEqual({
      success: true,
      revealId: begin.exportId,
      warningCount: 0,
      warnings: [],
    })
    expect(await fs.readFile(path.join(tempDirectory, '测试文档.md'), 'utf8')).toBe(markdown)
    expect(await fs.readFile(path.join(tempDirectory, ...entry.relativePath!.split('/')))).toEqual(
      Buffer.from(PNG),
    )
    expect(exporter.reveal(result.revealId)).toBe(true)
    expect(revealTarget).toHaveBeenCalledWith(path.join(tempDirectory, '测试文档.md'))
    await expect(exporter.commit({
      exportId: begin.exportId, markdown: '# 再次\n', generatedResources: [], warnings: [],
    })).rejects.toThrow('会话不存在或已失效')
  })

  it('copies workspace attachments without sending bytes through renderer', async () => {
    const sourcePath = path.join(tempDirectory, 'workspace-source.txt')
    const attachmentBytes = Buffer.alloc(2 * 1024 * 1024, 7)
    await fs.writeFile(sourcePath, attachmentBytes)
    knowledge.getAssetPath.mockResolvedValue(sourcePath)
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'attachment', resourceKey: `attachment:${RESOURCE_ID}`, assetId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '资料.txt', fileName: '资料.txt',
      mimeType: 'text/plain', size: attachmentBytes.byteLength,
    }
    const exporter = service()
    const begin = await exporter.begin(request([descriptor]))
    if (begin.canceled) throw new Error('unexpected cancellation')

    await exporter.commit({
      exportId: begin.exportId,
      markdown: '[附件](测试文档.assets/attachments/资料.txt)\n',
      generatedResources: [],
      warnings: [],
    })

    const relativePath = begin.manifest.resources[descriptor.resourceKey].relativePath!
    const copied = await fs.readFile(path.join(tempDirectory, ...relativePath.split('/')))
    expect(copied.byteLength).toBe(attachmentBytes.byteLength)
    expect(copied[0]).toBe(7)
  })

  it('rejects absolute and traversal paths at the final containment boundary', () => {
    const exporter = service() as any
    const session = {
      targetAssetsPath: path.join(tempDirectory, '测试文档.assets'),
      manifest: { assetDirectoryName: '测试文档.assets' },
    }
    expect(() => exporter.targetForRelativePath(
      session, '测试文档.assets/images/图 1.png',
    )).not.toThrow()
    expect(() => exporter.targetForRelativePath(session, '../outside.png')).toThrow('相对路径无效')
    expect(() => exporter.targetForRelativePath(session, '/tmp/outside.png')).toThrow('相对路径无效')
    expect(() => exporter.targetForRelativePath(
      session, 'other.assets/images/outside.png',
    )).toThrow('越出受管目录')
  })

  it('turns missing resources into warnings and still writes the document', async () => {
    knowledge.getCanvas.mockRejectedValue(new Error('画布不存在'))
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'canvas', resourceKey: `canvas:${RESOURCE_ID}`, canvasId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '缺失画布',
    }
    const exporter = service()
    const begin = await exporter.begin(request([descriptor]))
    if (begin.canceled) throw new Error('unexpected cancellation')
    expect(begin.manifest.resources[descriptor.resourceKey]).toMatchObject({
      status: 'failed', error: '画布不存在',
    })

    const result = await exporter.commit({
      exportId: begin.exportId,
      markdown: '> ⚠️ 缺失画布未能导出：画布不存在\n',
      generatedResources: [],
      warnings: [],
    })
    expect(result.warningCount).toBe(1)
    expect(await fs.readFile(selectedPath!, 'utf8')).toContain('缺失画布未能导出')
  })

  it('requires explicit confirmation before replacing the whole bundle', async () => {
    await fs.writeFile(selectedPath!, 'old markdown')
    await fs.mkdir(path.join(tempDirectory, '测试文档.assets'))
    await fs.writeFile(path.join(tempDirectory, '测试文档.assets', 'old.txt'), 'old asset')
    confirmReplace.mockResolvedValueOnce(false)
    const exporter = service()

    expect(await exporter.begin(request([]))).toEqual({ canceled: true })
    expect(await fs.readFile(selectedPath!, 'utf8')).toBe('old markdown')
    expect(await fs.readFile(path.join(tempDirectory, '测试文档.assets', 'old.txt'), 'utf8')).toBe('old asset')
  })

  it('rolls back both targets and removes temporary directories when final installation fails', async () => {
    await fs.writeFile(selectedPath!, 'old markdown')
    await fs.mkdir(path.join(tempDirectory, '测试文档.assets'))
    await fs.writeFile(path.join(tempDirectory, '测试文档.assets', 'old.txt'), 'old asset')
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'canvas', resourceKey: `canvas:${RESOURCE_ID}`, canvasId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '架构图',
    }
    const exporter = service()
    const begin = await exporter.begin(request([descriptor]))
    if (begin.canceled) throw new Error('unexpected cancellation')

    const originalRename = fs.rename.bind(fs)
    const rename = vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
      if (String(source).includes('.localkb-md-export-') && String(source).endsWith('测试文档.assets')) {
        throw Object.assign(new Error('simulated install failure'), { code: 'EIO' })
      }
      return originalRename(source, target)
    })
    try {
      await expect(exporter.commit({
        exportId: begin.exportId,
        markdown: 'new markdown',
        generatedResources: [{
          resourceKey: descriptor.resourceKey, mimeType: 'image/png', bytes: PNG,
        }],
        warnings: [],
      })).rejects.toThrow('simulated install failure')
    } finally {
      rename.mockRestore()
    }

    expect(await fs.readFile(selectedPath!, 'utf8')).toBe('old markdown')
    expect(await fs.readFile(path.join(tempDirectory, '测试文档.assets', 'old.txt'), 'utf8')).toBe('old asset')
    expect((await fs.readdir(tempDirectory)).filter((name) => name.startsWith('.localkb-md-'))).toEqual([])
  })

  it('leaves no partial bundle when a workspace source disappears after begin', async () => {
    const sourcePath = path.join(tempDirectory, 'transient.pdf')
    await fs.writeFile(sourcePath, 'pdf')
    knowledge.getAssetPath.mockResolvedValue(sourcePath)
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'attachment', resourceKey: `attachment:${RESOURCE_ID}`, assetId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '资料.pdf', fileName: '资料.pdf',
      mimeType: 'application/pdf', size: 3,
    }
    const exporter = service()
    const begin = await exporter.begin(request([descriptor]))
    if (begin.canceled) throw new Error('unexpected cancellation')
    await fs.rm(sourcePath)

    await expect(exporter.commit({
      exportId: begin.exportId,
      markdown: '[附件](relative)\n',
      generatedResources: [],
      warnings: [],
    })).rejects.toThrow()
    expect(await fs.readdir(tempDirectory)).toEqual([])
  })

  it('rejects a generated item above the per-resource size limit before writing', async () => {
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'canvas', resourceKey: `canvas:${RESOURCE_ID}`, canvasId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '架构图',
    }
    const exporter = service({ limits: { generatedResourceBytes: 7 } })
    const begin = await exporter.begin(request([descriptor]))
    if (begin.canceled) throw new Error('unexpected cancellation')

    await expect(exporter.commit({
      exportId: begin.exportId,
      markdown: '# x\n',
      generatedResources: [{
        resourceKey: descriptor.resourceKey,
        mimeType: 'image/png',
        bytes: PNG,
      }],
      warnings: [],
    })).rejects.toThrow('大小超出限制')
    expect(await fs.readdir(tempDirectory)).toEqual([])
  })

  it('rejects an oversized generated bundle across multiple valid resources', async () => {
    const secondResourceId = '00000000-0000-4000-8000-000000000005'
    const secondNodeId = '00000000-0000-4000-8000-000000000006'
    const descriptors: MarkdownExportResourceDescriptor[] = [{
      kind: 'canvas', resourceKey: `canvas:${RESOURCE_ID}`, canvasId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '画布一',
    }, {
      kind: 'canvas', resourceKey: `canvas:${secondResourceId}`, canvasId: secondResourceId,
      nodeIds: [secondNodeId], label: '画布二',
    }]
    const exporter = service({ limits: { generatedBundleBytes: 12 } })
    const begin = await exporter.begin(request(descriptors))
    if (begin.canceled) throw new Error('unexpected cancellation')

    await expect(exporter.commit({
      exportId: begin.exportId,
      markdown: '# x\n',
      generatedResources: descriptors.map((descriptor) => ({
        resourceKey: descriptor.resourceKey, mimeType: 'image/png', bytes: PNG,
      })),
      warnings: [],
    })).rejects.toThrow('总大小超出限制')
    expect(await fs.readdir(tempDirectory)).toEqual([])
  })

  it('expires sessions and rejects unknown or invalid generated resources', async () => {
    let now = 100
    const descriptor: MarkdownExportResourceDescriptor = {
      kind: 'canvas', resourceKey: `canvas:${RESOURCE_ID}`, canvasId: RESOURCE_ID,
      nodeIds: [NODE_ID], label: '架构图',
    }
    const exporter = service({ now: () => now, sessionTtlMs: 20 })
    const expired = await exporter.begin(request([descriptor]))
    if (expired.canceled) throw new Error('unexpected cancellation')
    now = 121
    await expect(exporter.commit({
      exportId: expired.exportId, markdown: '# x\n', generatedResources: [], warnings: [],
    })).rejects.toThrow('会话不存在或已失效')

    const fresh = await exporter.begin(request([descriptor]))
    if (fresh.canceled) throw new Error('unexpected cancellation')
    await expect(exporter.commit({
      exportId: fresh.exportId,
      markdown: '# x\n',
      generatedResources: [{
        resourceKey: descriptor.resourceKey, mimeType: 'image/png', bytes: Uint8Array.from([1, 2]),
      }],
      warnings: [],
    })).rejects.toThrow('有效 PNG')

    const unknown = await exporter.begin(request([]))
    if (unknown.canceled) throw new Error('unexpected cancellation')
    await expect(exporter.commit({
      exportId: unknown.exportId,
      markdown: '# x\n',
      generatedResources: [{ resourceKey: 'canvas:unknown', mimeType: 'image/png', bytes: PNG }],
      warnings: [],
    })).rejects.toThrow('未声明')
  })
})
