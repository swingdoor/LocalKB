import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExcalidrawScene, LoadedCanvas, TipTapDocument } from '../../shared/knowledge-types'
import { FileKnowledgeStore } from './file-knowledge-store'
import { KnowledgeService } from './knowledge-service'

const emptyScene = (): ExcalidrawScene => ({
  type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
})

describe('KnowledgeService V3', () => {
  let root: string
  let storage: FileKnowledgeStore
  let service: KnowledgeService

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-v3-service-'))
    storage = new FileKnowledgeStore(root)
    service = new KnowledgeService(storage)
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('creates a complete V3 vault and persisted timestamps', async () => {
    const vault = await service.createVault('Vault')
    expect(vault).toMatchObject({ schemaVersion: 3, formatVersions: { document: 1, canvas: 1 } })
    expect(await storage.readAssetManifest(vault.id)).toEqual({ schemaVersion: 1, assets: {} })
    const document = await service.createContent(vault.id, 'document', 'Doc', null)
    const before = document.updatedAt
    await new Promise((resolve) => setTimeout(resolve, 2))
    const loaded = await service.replaceDocument(vault.id, document.id, {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'changed' }] }],
    })
    expect(Date.parse(loaded.updatedAt)).toBeGreaterThan(Date.parse(before))
  })

  it('supports top-level mindmaps with native flat storage', async () => {
    const vault = await service.createVault('Vault')
    const mind = await service.createContent(vault.id, 'mindmap', 'Map', null)
    expect((await service.getMindMap(vault.id, mind.id)).nodeData.topic).toBe('中心主题')
    expect(await storage.exists(storage.paths.mindMapFile(vault.id, mind.id))).toBe(true)
  })

  it('allows one vault-scoped canvas to be shared by two documents', async () => {
    const vault = await service.createVault('Vault')
    const first = await service.createContent(vault.id, 'document', 'First', null)
    const second = await service.createContent(vault.id, 'document', 'Second', null)
    const canvas = await service.createCanvas(vault.id, emptyScene())
    const withReference = (nodeId: string): TipTapDocument => ({
      type: 'doc', content: [{
        type: 'canvasReference', attrs: { nodeId, canvasId: canvas.id },
      }],
    })
    await service.replaceDocument(vault.id, first.id, withReference('11111111-1111-4111-8111-111111111111'))
    await service.replaceDocument(vault.id, second.id, withReference('22222222-2222-4222-8222-222222222222'))
    expect(await service.findResourceReferences(vault.id, 'canvas', canvas.id)).toHaveLength(2)
    await expect(service.removeCanvas(vault.id, canvas.id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('resolves top-level canvas references without document ownership', async () => {
    const vault = await service.createVault('Vault')
    const board = await service.createContent(vault.id, 'canvas', 'Board', null)
    const document = await service.createContent(vault.id, 'document', 'Doc', null)
    await service.replaceDocument(vault.id, document.id, {
      type: 'doc', content: [{
        type: 'canvasReference',
        attrs: { nodeId: '33333333-3333-4333-8333-333333333333', canvasId: board.id },
      }],
    })
    const loaded = await service.getCanvas(vault.id, board.id) as LoadedCanvas
    expect(loaded.contentType).toBe('canvas')
    expect(loaded.content.type).toBe('excalidraw')
  })

  it('hard-validates canonical attachments and forbidden local image paths', async () => {
    const vault = await service.createVault('Vault')
    const document = await service.createContent(vault.id, 'document', 'Doc', null)
    const asset = await service.importAsset(
      vault.id, 'text/plain', new Uint8Array([1, 2, 3]), 'renderer', 'notes.txt',
    )
    await expect(service.replaceDocument(vault.id, document.id, {
      type: 'doc', content: [{
        type: 'fileAttachment',
        attrs: {
          nodeId: '44444444-4444-4444-8444-444444444444', assetId: asset.id,
          fileName: 'legacy.txt', mimeType: 'text/plain', size: 3,
        },
      }],
    } as TipTapDocument)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.replaceDocument(vault.id, document.id, {
      type: 'doc', content: [{
        type: 'image', attrs: { nodeId: '55555555-5555-4555-8555-555555555555', src: '/tmp/local.png' },
      }],
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.replaceDocument(vault.id, document.id, {
      type: 'doc', content: [{
        type: 'fileAttachment',
        attrs: {
          nodeId: '66666666-6666-4666-8666-666666666666', assetId: asset.id,
          displayName: '合同.txt',
        },
      }],
    })).resolves.toMatchObject({ contentType: 'document' })
  })

  it('rejects cross-vault resource references', async () => {
    const first = await service.createVault('First')
    const second = await service.createVault('Second')
    const canvas = await service.createCanvas(first.id, emptyScene())
    const document = await service.createContent(second.id, 'document', 'Doc', null)
    await expect(service.replaceDocument(second.id, document.id, {
      type: 'doc', content: [{
        type: 'canvasReference',
        attrs: { nodeId: '77777777-7777-4777-8777-777777777777', canvasId: canvas.id },
      }],
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('serializes mutations per vault and emits vault-scoped events', async () => {
    const vault = await service.createVault('Vault')
    const document = await service.createContent(vault.id, 'document', 'Doc', null)
    const events: string[] = []
    service.subscribe((event) => events.push(`${event.resourceType}:${event.resourceId}:${event.change}`))
    await Promise.all([
      service.renameContent(vault.id, document.id, 'A'),
      service.renameContent(vault.id, document.id, 'B'),
    ])
    expect((await service.getDocument(vault.id, document.id)).title).toBe('B')
    expect(events.filter((event) => event.includes(document.id))).toHaveLength(2)
  })

  it('compensates a staged create when tree commit fails', async () => {
    const vault = await service.createVault('Vault')
    const original = storage.writeTree.bind(storage)
    const spy = vi.spyOn(storage, 'writeTree').mockImplementationOnce(async () => {
      throw new Error('injected tree failure')
    }).mockImplementation(original)
    await expect(service.createContent(vault.id, 'document', 'Broken', null)).rejects.toBeTruthy()
    const names = await fs.readdir(storage.paths.documents(vault.id)).catch(() => [])
    expect(names).toEqual([])
    spy.mockRestore()
  })

  it('commits a renderer resource and its document reference under one vault mutation', async () => {
    const vault = await service.createVault('Vault')
    const document = await service.createContent(vault.id, 'document', 'Doc', null)
    const resourceId = '88888888-8888-4888-8888-888888888888'
    const result = await service.insertRendererResource(
      vault.id,
      document.id,
      {
        type: 'doc', content: [{
          type: 'canvasReference',
          attrs: { nodeId: '99999999-9999-4999-8999-999999999999', canvasId: resourceId },
        }],
      },
      { resourceType: 'canvas', resourceId, content: emptyScene() },
    )

    expect(result).toMatchObject({ resourceType: 'canvas', resourceId })
    expect(await storage.readCanvas(vault.id, resourceId)).toMatchObject({ type: 'excalidraw' })
    expect(collectCanvasIds((await service.getDocument(vault.id, document.id)).content)).toEqual([resourceId])
  })

  it('removes only the newly created renderer resource when the document commit fails', async () => {
    const vault = await service.createVault('Vault')
    const document = await service.createContent(vault.id, 'document', 'Doc', null)
    const resourceId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const previous = (await service.getDocument(vault.id, document.id)).content
    const original = storage.writeDocument.bind(storage)
    const spy = vi.spyOn(storage, 'writeDocument').mockImplementationOnce(async () => {
      throw new Error('injected document failure')
    }).mockImplementation(original)

    await expect(service.insertRendererResource(
      vault.id,
      document.id,
      {
        type: 'doc', content: [{
          type: 'mindmapReference',
          attrs: { nodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', mindmapId: resourceId },
        }],
      },
      { resourceType: 'mindmap', resourceId, content: { nodeData: { id: 'root', topic: 'Root' } } },
    )).rejects.toBeTruthy()

    expect(await storage.exists(storage.paths.mindMapFile(vault.id, resourceId))).toBe(false)
    expect((await service.getDocument(vault.id, document.id)).content).toEqual(previous)
    spy.mockRestore()
  })
})

function collectCanvasIds(document: TipTapDocument): string[] {
  return (document.content ?? [])
    .filter((node) => node.type === 'canvasReference')
    .map((node) => String(node.attrs?.canvasId))
}
