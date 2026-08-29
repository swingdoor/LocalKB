import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ExcalidrawElement,
  ExcalidrawScene,
  LoadedCanvas,
  TipTapDocument,
  VaultTreeV2,
  VaultV2,
} from '../../shared/knowledge-types'
import { FileKnowledgeStore } from './file-knowledge-store'
import { KnowledgeError, KnowledgeService, toResult } from './knowledge-service'

const NODE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RESOURCE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RESOURCE_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const emptyScene = (): ExcalidrawScene => ({
  type: 'excalidraw',
  version: 2,
  source: 'localkb-test',
  elements: [],
  appState: { futureState: true },
  files: {},
})

const element = (
  id: string,
  type: 'rectangle' | 'image',
  extra: Record<string, unknown> = {},
): ExcalidrawElement => ({
  id, type, x: 0, y: 0, width: 100, height: 100, angle: 0,
  strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
  strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
  groupIds: [], frameId: null, index: null, roundness: null,
  seed: 1, version: 1, versionNonce: 1, isDeleted: false,
  boundElements: null, updated: 1, link: null, locked: false,
  ...(type === 'image' ? { fileId: null, status: 'saved', scale: [1, 1], crop: null } : {}),
  ...extra,
}) as ExcalidrawElement

function documentWith(nodes: TipTapDocument['content']): TipTapDocument {
  return { type: 'doc', content: nodes }
}

describe('KnowledgeService', () => {
  let root: string
  let storage: FileKnowledgeStore
  let service: KnowledgeService

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-service-'))
    storage = new FileKnowledgeStore(root)
    service = new KnowledgeService(storage)
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('manages vaults, groups, mixed content, moves, renames, and committed events', async () => {
    const events: string[] = []
    service.subscribe((event) => events.push(`${event.resourceType}:${event.change}:${event.origin}`))
    const vault = await service.createVault(' Vault ', 'renderer')
    const group = await service.createGroup(vault.id, null, 'Group')
    const document = await service.createContent(vault.id, 'document', 'Note', group.id)
    const canvas = await service.createContent(vault.id, 'canvas', 'Board', null, 0)
    expect(await storage.exists(storage.paths.documentFile(vault.id, document.id))).toBe(true)
    expect(await storage.exists(storage.paths.canvasFile(vault.id, canvas.id))).toBe(true)

    await service.moveTreeEntry(vault.id, document.id, null, 1)
    expect((await service.renameContent(vault.id, document.id, 'Renamed')).title).toBe('Renamed')
    expect((await service.renameGroup(vault.id, group.id, 'Renamed group')).name).toBe('Renamed group')
    await service.deleteGroup(vault.id, group.id)
    expect((await service.getTree(vault.id)).entries.find((entry) => entry.id === document.id))
      .toMatchObject({ parentId: null, order: 1 })
    expect(events).toEqual(expect.arrayContaining([
      'vault:created:renderer', 'tree:created:renderer', 'document:created:renderer',
      'canvas:created:renderer', 'tree:moved:renderer',
    ]))

    expect((await service.renameVault(vault.id, 'New vault')).name).toBe('New vault')
    await service.deleteContent(vault.id, canvas.id)
    expect(await storage.exists(storage.paths.canvasFile(vault.id, canvas.id))).toBe(false)
    await service.deleteVault(vault.id)
    expect(await storage.exists(storage.paths.vault(vault.id))).toBe(false)
  })

  it('applies all document edit groups and preserves stable node IDs', async () => {
    const vault = await service.createVault('V')
    const summary = await service.createContent(vault.id, 'document', 'D', null)
    let loaded = await service.replaceDocument(vault.id, summary.id, documentWith([
      { type: 'paragraph', attrs: { nodeId: NODE_A }, content: [{ type: 'text', text: 'hello' }] },
    ]))
    loaded = await service.insertDocumentNodes(vault.id, summary.id, null, 1, [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'title' }] },
    ])
    const headingId = loaded.content.content?.[1].attrs?.nodeId as string
    loaded = await service.appendDocumentNodes(vault.id, summary.id, headingId, [
      { type: 'text', text: ' nested' },
    ])
    loaded = await service.patchDocumentNode(vault.id, summary.id, headingId, {
      attrs: { level: 3, future: true },
    })
    loaded = await service.replaceDocumentText(vault.id, summary.id, NODE_A, 1, 4, 'i')
    expect(loaded.content.content?.[0].content?.[0].text).toBe('hio')
    loaded = await service.replaceDocumentNode(vault.id, summary.id, headingId, {
      type: 'blockquote', futureNode: 7,
    })
    expect(loaded.content.content?.[1]).toMatchObject({
      type: 'blockquote', attrs: { nodeId: headingId }, futureNode: 7,
    })
    loaded = await service.deleteDocumentNodes(vault.id, summary.id, [headingId])
    expect(loaded.content.content).toHaveLength(1)
    expect(loaded.content.content?.[0].attrs?.nodeId).toBe(NODE_A)
  })

  it('validates document ownership and keeps resource deletion explicit after dereference', async () => {
    const vault = await service.createVault('V')
    const first = await service.createContent(vault.id, 'document', 'First', null)
    const second = await service.createContent(vault.id, 'document', 'Second', null)
    const embedded = await service.createEmbeddedCanvas(vault.id, first.id, emptyScene())
    const referenced = documentWith([{
      type: 'canvasReference',
      attrs: { nodeId: NODE_A, canvasId: embedded.id },
    }])
    await service.replaceDocument(vault.id, first.id, referenced)
    await expect(service.deleteEmbeddedCanvas(vault.id, first.id, embedded.id)).rejects
      .toMatchObject({ code: 'CONFLICT' })
    await expect(service.replaceDocument(vault.id, second.id, referenced)).rejects
      .toMatchObject({ code: 'NOT_FOUND' })

    await service.replaceDocument(vault.id, first.id, documentWith([]))
    expect(await storage.readCanvas(vault.id, embedded.id, first.id)).toEqual(emptyScene())
    await service.removeCanvas(vault.id, embedded.id)
    await expect(storage.readCanvas(vault.id, embedded.id, first.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await storage.exists(storage.paths.resourceTrash(vault.id, first.id))).toBe(false)
  })

  it('enforces internal document links and native attachment integrity', async () => {
    const vault = await service.createVault('V')
    const source = await service.createContent(vault.id, 'document', 'Source', null)
    const target = await service.createContent(vault.id, 'document', 'Target', null)
    const asset = await service.importAsset(
      vault.id, source.id, 'text/plain', new Uint8Array([1, 2, 3]), 'renderer', 'notes.txt',
    )
    await service.replaceDocument(vault.id, source.id, documentWith([
      {
        type: 'paragraph', attrs: { nodeId: NODE_A }, content: [{
          type: 'documentReference', attrs: {
            nodeId: RESOURCE_A, documentId: target.id, label: 'Target',
          },
        }],
      },
      { type: 'fileAttachment', attrs: {
        nodeId: RESOURCE_B, assetId: asset.id, fileName: 'notes.txt',
        mimeType: 'text/plain', size: 3,
      } },
    ]))

    await expect(service.deleteContent(vault.id, target.id)).rejects.toMatchObject({
      code: 'CONFLICT', details: [expect.objectContaining({ documentId: source.id, nodeId: RESOURCE_A })],
    })
    await expect(service.deleteAsset(vault.id, source.id, asset.id)).rejects
      .toMatchObject({ code: 'CONFLICT' })
    await expect(service.replaceDocument(vault.id, source.id, documentWith([{
      type: 'fileAttachment', attrs: {
        nodeId: RESOURCE_B, assetId: asset.id, fileName: 'notes.txt',
        mimeType: 'text/plain', size: 2,
      },
    }]))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.replaceDocument(vault.id, source.id, documentWith([{
      type: 'paragraph', attrs: { nodeId: NODE_A }, content: [{
        type: 'documentReference', attrs: {
          nodeId: RESOURCE_A, documentId: '99999999-9999-4999-8999-999999999999',
        },
      }],
    }]))).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await service.replaceDocument(vault.id, source.id, documentWith([]))
    await service.deleteAsset(vault.id, source.id, asset.id)
    await service.deleteTreeEntry(vault.id, target.id)
  })

  it('supports top-level/embedded canvas, mind-map, and asset operation groups', async () => {
    const vault = await service.createVault('V')
    const document = await service.createContent(vault.id, 'document', 'D', null)
    const board = await service.createContent(vault.id, 'canvas', 'C', null)
    await service.upsertCanvasElements(vault.id, board.id, [
      element('shape', 'rectangle', { future: true }),
      element('image', 'image', { fileId: 'file-a' }),
    ]).catch((error) => {
      expect(error).toMatchObject({ code: 'NOT_FOUND' })
    })
    await service.upsertCanvasFiles(vault.id, board.id, {
      'file-a': {
        id: 'file-a', mimeType: 'image/png', dataURL: 'data:image/png;base64,AQ==', created: 1,
      },
    })
    await service.upsertCanvasElements(vault.id, board.id, [
      element('shape', 'rectangle', { future: true }),
      element('image', 'image', { fileId: 'file-a' }),
    ])
    await service.patchCanvasElements(vault.id, board.id, [
      { id: 'shape', changes: { strokeColor: '#123' } },
    ])
    await service.reorderCanvasElements(vault.id, board.id, ['image', 'shape'])
    await service.deleteCanvasElements(vault.id, board.id, ['image'])
    await service.deleteCanvasFiles(vault.id, board.id, ['file-a'])
    const loadedCanvas = await service.getCanvas(vault.id, board.id) as LoadedCanvas
    expect(loadedCanvas.content.elements[0]).toMatchObject({
      id: 'shape', future: true, strokeColor: '#123',
    })

    const mind = await service.createMindMap(vault.id, document.id, {
      nodeData: { id: 'root', topic: 'Root' }, futureRoot: true,
    })
    let mindValue = await service.insertMindMapNode(
      vault.id, document.id, mind.id, 'root', 0, { id: 'a', topic: 'A' },
    )
    mindValue = await service.patchMindMapNode(
      vault.id, document.id, mind.id, { id: 'a', changes: { topic: 'Updated' } },
    )
    await service.insertMindMapNode(
      vault.id, document.id, mind.id, 'root', 1, { id: 'b', topic: 'B' },
    )
    mindValue = await service.moveMindMapNode(vault.id, document.id, mind.id, 'a', 'b', 0)
    expect(mindValue.nodeData.children?.[0].children?.[0].topic).toBe('Updated')
    mindValue = await service.deleteMindMapNode(vault.id, document.id, mind.id, 'a')
    expect(mindValue.futureRoot).toBe(true)
    await service.replaceMindMap(vault.id, document.id, mind.id, mindValue)
    await service.deleteMindMap(vault.id, document.id, mind.id)

    const asset = await service.importAsset(
      vault.id, document.id, 'image/png', new Uint8Array([1, 2, 3]),
    )
    expect(await service.readAsset(vault.id, document.id, asset.id)).toMatchObject({
      id: asset.id, mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]),
    })
    await service.deleteAsset(vault.id, document.id, asset.id)
  })

  it('rebuilds resource locations, detects duplicates, and namespaces IDs by vault', async () => {
    const firstVault = await service.createVault('First')
    const secondVault = await service.createVault('Second')
    const firstDoc = await service.createContent(firstVault.id, 'document', 'A', null)
    const secondDoc = await service.createContent(secondVault.id, 'document', 'B', null)
    await storage.writeCanvas(firstVault.id, RESOURCE_A, emptyScene(), firstDoc.id)
    await storage.writeCanvas(secondVault.id, RESOURCE_A, emptyScene(), secondDoc.id)
    const topLevel = await service.createContent(firstVault.id, 'canvas', 'Board', null)
    const rebuilt = await service.rebuildResourceLocator(firstVault.id)
    expect(rebuilt.canvases.get(RESOURCE_A)).toEqual({ scope: 'embedded', documentId: firstDoc.id })
    expect(await service.locateCanvas(firstVault.id, topLevel.id)).toEqual({ scope: 'top-level' })
    expect(await service.locateCanvas(secondVault.id, RESOURCE_A)).toEqual({
      scope: 'embedded', documentId: secondDoc.id,
    })

    await storage.writeCanvas(firstVault.id, RESOURCE_B, emptyScene(), firstDoc.id)
    await expect(service.locateCanvas(firstVault.id, RESOURCE_B)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await service.rebuildResourceLocator(firstVault.id)
    expect(await service.locateCanvas(firstVault.id, RESOURCE_B)).toEqual({
      scope: 'embedded', documentId: firstDoc.id,
    })
    await service.removeCanvas(firstVault.id, RESOURCE_B)
    await expect(service.locateCanvas(firstVault.id, RESOURCE_B)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const duplicateOwner = await service.createContent(firstVault.id, 'document', 'Duplicate', null)
    await storage.writeCanvas(firstVault.id, RESOURCE_A, emptyScene(), duplicateOwner.id)
    await expect(service.rebuildResourceLocator(firstVault.id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('searches summaries first and returns bounded lightweight title/text hits', async () => {
    const vault = await service.createVault('V')
    const group = await service.createGroup(vault.id, null, 'Folder')
    const first = await service.createContent(vault.id, 'document', 'Alpha title', group.id)
    const second = await service.createContent(vault.id, 'document', 'Other', null)
    await service.replaceDocument(vault.id, second.id, documentWith([{
      type: 'paragraph', attrs: { nodeId: NODE_A }, content: [{ type: 'text', text: 'contains needle here' }],
    }]))
    expect(await service.search(vault.id, '', 1)).toHaveLength(1)
    expect(await service.search(vault.id, 'alpha')).toEqual([
      expect.objectContaining({ id: first.id, path: ['Folder'] }),
    ])
    expect(await service.search(vault.id, 'needle')).toEqual([
      expect.objectContaining({ id: second.id, snippet: expect.stringContaining('needle') }),
    ])
  })

  it('compensates a staged create when the tree commit fails', async () => {
    class FailingTreeStore extends FileKnowledgeStore {
      failNextTree = false
      override async writeTree(vaultId: string, tree: VaultTreeV2): Promise<VaultTreeV2> {
        if (this.failNextTree) {
          this.failNextTree = false
          throw new KnowledgeError('PERSISTENCE_ERROR', 'injected tree failure')
        }
        return super.writeTree(vaultId, tree)
      }
    }
    const failing = new FailingTreeStore(path.join(root, 'failure'))
    const subject = new KnowledgeService(failing)
    const vault = await subject.createVault('V')
    failing.failNextTree = true
    await expect(subject.createContent(vault.id, 'document', 'D', null)).rejects
      .toMatchObject({ code: 'PERSISTENCE_ERROR' })
    expect((await failing.readTree(vault.id)).entries).toEqual([])
    const staging = failing.paths.operationRoot(vault.id, 'staging')
    expect(await failing.exists(staging) ? await fs.readdir(staging) : []).toEqual([])
  })

  it('serializes one vault, allows independent vaults, emits after commit, and keeps logs metadata-only', async () => {
    class DelayedStore extends FileKnowledgeStore {
      activeByVault = new Map<string, number>()
      maxByVault = new Map<string, number>()
      globalActive = 0
      globalMax = 0
      committed = new Set<string>()
      override async writeVault(value: VaultV2): Promise<void> {
        const active = (this.activeByVault.get(value.id) ?? 0) + 1
        this.activeByVault.set(value.id, active)
        this.maxByVault.set(value.id, Math.max(this.maxByVault.get(value.id) ?? 0, active))
        this.globalActive += 1
        this.globalMax = Math.max(this.globalMax, this.globalActive)
        await new Promise((resolve) => setTimeout(resolve, 20))
        await super.writeVault(value)
        this.committed.add(value.id)
        this.globalActive -= 1
        this.activeByVault.set(value.id, active - 1)
      }
    }
    const delayed = new DelayedStore(path.join(root, 'queues'))
    const logs: object[] = []
    const subject = new KnowledgeService(delayed, (entry) => logs.push(entry))
    const first = await subject.createVault('First')
    const second = await subject.createVault('Second')
    delayed.globalMax = 0
    delayed.maxByVault.clear()
    delayed.committed.clear()
    const eventCommitted: boolean[] = []
    subject.subscribe((event) => {
      if (event.resourceType === 'vault' && event.change === 'updated') {
        eventCommitted.push(delayed.committed.has(event.vaultId))
      }
    })
    await Promise.all([
      subject.renameVault(first.id, 'A'),
      subject.renameVault(first.id, 'B'),
      subject.renameVault(second.id, 'C'),
    ])
    expect(delayed.maxByVault.get(first.id)).toBe(1)
    expect(delayed.globalMax).toBe(2)
    expect(eventCommitted).toEqual([true, true, true])
    expect((await subject.getVault(first.id)).name).toBe('B')

    await expect(subject.renameVault(first.id, '   ')).rejects.toMatchObject({
      code: 'INVALID_NAME',
    })
    expect(logs).toEqual([
      { operation: 'vault.rename', code: 'INVALID_NAME', vaultId: first.id, resourceId: first.id },
    ])
    expect(await toResult(() => subject.getVault('bad'))).toMatchObject({
      ok: false, error: { code: 'INVALID_ID' },
    })
  })
})
