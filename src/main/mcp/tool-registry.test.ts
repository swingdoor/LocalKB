import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileKnowledgeStore } from '../knowledge/file-knowledge-store'
import { KnowledgeService } from '../knowledge/knowledge-service'
import { createMcpToolDefinitions, type ToolDefinition } from './tool-registry'
import type { ExcalidrawElement } from '../../shared/knowledge-types'

const NODE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function element(
  id: string,
  type: 'rectangle' | 'text',
  extra: Record<string, unknown> = {},
): ExcalidrawElement {
  return {
    id, type, x: 0, y: 0, width: 100, height: 100, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
    strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, index: null, roundness: null,
    seed: 1, version: 1, versionNonce: 1, isDeleted: false,
    boundElements: null, updated: 1, link: null, locked: false,
    ...(type === 'text' ? {
      fontSize: 20, fontFamily: 5, text: '', textAlign: 'left', verticalAlign: 'top',
      containerId: null, originalText: '', autoResize: true, lineHeight: 1.25,
    } : {}),
    ...extra,
  } as ExcalidrawElement
}

describe('MCP domain tools', () => {
  let root: string
  let service: KnowledgeService
  let tools: Map<string, ToolDefinition>

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-mcp-tools-'))
    service = new KnowledgeService(new FileKnowledgeStore(root))
    tools = new Map(createMcpToolDefinitions(service).map((tool) => [tool.name, tool]))
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  const run = (name: string, input: Record<string, unknown>) => tools.get(name)!.run(input)

  it('uses explicit tools and strict top-level schemas', () => {
    expect([...tools.keys()]).toHaveLength(31)
    expect(tools.has('document_edit')).toBe(false)
    expect(tools.get('vault_create')!.inputSchema.safeParse({ name: 'V', action: 'create' }).success).toBe(false)
    expect(tools.get('vault_delete')!.inputSchema.safeParse({ vaultId: NODE_ID, confirm: false }).success).toBe(false)
    const documentInsert = tools.get('document_insert')!.inputSchema
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{ type: 'excalidraw', attrs: { canvasId: NODE_ID } }],
    }).success).toBe(false)
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{
        type: 'paragraph', content: [
          { type: 'documentReference', attrs: { documentId: NODE_ID, label: '目标' } },
          { type: 'text', text: 'marked', marks: [
            { type: 'underline' }, { type: 'highlight', attrs: { color: '#FEF08A' } },
          ] },
        ],
      }],
    }).success).toBe(true)
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{ type: 'inlineMath', attrs: { latex: 'x^2' } }],
    }).success).toBe(false)
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{ type: 'fileAttachment', attrs: {
        assetId: NODE_ID, fileName: 'a.txt', mimeType: 'text/plain',
      } }],
    }).success).toBe(false)
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{ type: 'details', content: [{ type: 'detailsContent', content: [{ type: 'paragraph' }] }] }],
    }).success).toBe(false)
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{ type: 'canvasReference', attrs: { nodeId: NODE_ID } }],
    }).success).toBe(false)
    expect(documentInsert.safeParse({
      vaultId: NODE_ID, documentId: NODE_ID,
      nodes: [{
        type: 'paragraph',
        content: [{ type: 'canvasReference', attrs: { canvasId: NODE_ID } }],
      }],
    }).success).toBe(false)
    const canvasInsert = tools.get('canvas_insert')!.inputSchema
    expect(canvasInsert.safeParse({
      vaultId: NODE_ID, canvasId: NODE_ID,
      elements: [{ id: 'shape', type: 'rectangle' }],
      placement: { position: 'front' },
    }).success).toBe(false)
    expect(canvasInsert.safeParse({
      vaultId: NODE_ID, canvasId: NODE_ID,
      elements: [element('shape', 'rectangle')],
      placement: { position: 'front' },
    }).success).toBe(true)
  })

  it('covers vault and tree contracts without partial structural mutations', async () => {
    const vault = await run('vault_create', { name: 'Before' }) as { id: string }
    expect(await run('vault_list', {})).toEqual([expect.objectContaining({ id: vault.id, name: 'Before' })])
    await run('vault_update', { vaultId: vault.id, name: 'After' })
    const group = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'group', name: 'Parent' },
    }) as { id: string }
    const child = await run('tree_insert', {
      vaultId: vault.id, parentId: group.id, entry: { kind: 'document', title: 'Child' },
    }) as { id: string }
    await expect(run('tree_delete', { vaultId: vault.id, entryId: group.id, confirm: true }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(run('tree_update', {
      vaultId: vault.id, entryId: group.id, patch: { title: 'Wrong', parentId: child.id },
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await run('tree_get', { vaultId: vault.id })).toMatchObject({ entries: [
      expect.objectContaining({ id: group.id, name: 'Parent', parentId: null }),
      expect.objectContaining({ id: child.id, title: 'Child', parentId: group.id }),
    ] })
    await run('tree_delete', { vaultId: vault.id, entryId: child.id, confirm: true })
    await expect(service.getDocument(vault.id, child.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await run('tree_delete', { vaultId: vault.id, entryId: group.id, confirm: true })
    await run('vault_delete', { vaultId: vault.id, confirm: true })
    expect(await run('vault_list', {})).toEqual([])
  })

  it('manages a native TipTap document through read-search-update-delete', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }
    await run('document_insert', {
      vaultId: vault.id, documentId: document.id,
      nodes: [{
        type: 'paragraph', attrs: { nodeId: NODE_ID, textAlign: 'center' },
        content: [{ type: 'text', text: 'hello', marks: [{ type: 'bold' }] }],
      }],
    })
    const search = await run('document_search', {
      vaultId: vault.id, documentId: document.id, query: 'ell',
    }) as { totalMatchCount: number; hits: Array<{ nodeId: string }> }
    expect(search).toMatchObject({ totalMatchCount: 1, hits: [{ nodeId: NODE_ID }] })

    await run('document_update', {
      vaultId: vault.id, documentId: document.id,
      updates: [{ nodeId: NODE_ID, content: [{ type: 'text', text: 'updated' }] }],
    })
    const nodes = await run('document_get', {
      vaultId: vault.id, documentId: document.id, nodeIds: [NODE_ID],
    }) as Array<{ node: { attrs: Record<string, unknown>; content: Array<{ text: string; marks?: unknown }> } }>
    expect(nodes[0].node.attrs).toMatchObject({ nodeId: NODE_ID, textAlign: 'center' })
    expect(nodes[0].node.content).toEqual([{ type: 'text', text: 'updated' }])

    await run('document_delete', { vaultId: vault.id, documentId: document.id, nodeIds: [NODE_ID] })
    await expect(run('document_get', {
      vaultId: vault.id, documentId: document.id, nodeIds: [NODE_ID],
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unsupported document node types before persistence', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }

    await expect(run('document_insert', {
      vaultId: vault.id, documentId: document.id,
      nodes: [{ type: 'excalidraw', attrs: { canvasId: NODE_ID } }],
    })).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringContaining('canvasReference') })

    const initial = await service.getDocument(vault.id, document.id)
    const paragraphId = initial.content.content?.[0].attrs?.nodeId as string
    await expect(run('document_insert', {
      vaultId: vault.id, documentId: document.id, parentNodeId: paragraphId,
      nodes: [{ type: 'paragraph', content: [{ type: 'text', text: 'invalid child' }] }],
    })).rejects.toMatchObject({
      code: 'INVALID_INPUT', message: expect.stringContaining('paragraph'),
    })

    await expect(run('document_update', {
      vaultId: vault.id, documentId: document.id,
      updates: [{
        nodeId: paragraphId,
        content: [{ type: 'mindmapReference', attrs: { mindmapId: NODE_ID } }],
      }],
    })).rejects.toMatchObject({
      code: 'INVALID_INPUT', message: expect.stringContaining('paragraph'),
    })

    const loaded = await service.getDocument(vault.id, document.id)
    expect(loaded.content.content).toEqual([
      expect.objectContaining({ type: 'paragraph' }),
    ])
  })

  it('keeps embedded resource and document-reference lifecycles separate', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }
    const canvas = await run('canvas_create', {
      vaultId: vault.id, documentId: document.id,
    }) as { id: string }
    await run('document_insert', {
      vaultId: vault.id, documentId: document.id,
      nodes: [{ type: 'canvasReference', attrs: { nodeId: NODE_ID, canvasId: canvas.id } }],
    })
    await expect(run('canvas_remove', { vaultId: vault.id, canvasId: canvas.id }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
    await run('document_delete', { vaultId: vault.id, documentId: document.id, nodeIds: [NODE_ID] })
    await run('canvas_remove', { vaultId: vault.id, canvasId: canvas.id })
    await expect(run('canvas_get', { vaultId: vault.id, canvasId: canvas.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('round-trips mind-map nodes and asset bytes by resource ID', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }
    const map = await run('mindmap_create', {
      vaultId: vault.id, documentId: document.id, data: { nodeData: { id: 'root', topic: 'Root' } },
    }) as { id: string }
    await run('mindmap_insert', {
      vaultId: vault.id, mindMapId: map.id, parentNodeId: 'root',
      nodes: [{ id: 'a', topic: 'Alpha', style: { color: 'red' } }],
    })
    await run('mindmap_update', {
      vaultId: vault.id, mindMapId: map.id, updates: [{ nodeId: 'a', set: { topic: 'Updated' } }],
    })
    expect(await run('mindmap_search', {
      vaultId: vault.id, mindMapId: map.id, query: 'Updated',
    })).toMatchObject({ totalMatchCount: 1, hits: [{ node: { topic: 'Updated', style: { color: 'red' } } }] })
    await run('document_insert', {
      vaultId: vault.id, documentId: document.id,
      nodes: [{ type: 'mindmapReference', attrs: { nodeId: NODE_ID, mindmapId: map.id } }],
    })
    await expect(run('mindmap_remove', { vaultId: vault.id, mindMapId: map.id }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
    await run('document_delete', { vaultId: vault.id, documentId: document.id, nodeIds: [NODE_ID] })
    await run('mindmap_remove', { vaultId: vault.id, mindMapId: map.id })

    const asset = await run('asset_import', {
      vaultId: vault.id, documentId: document.id, mimeType: 'image/png', dataBase64: 'AQID',
    }) as { id: string }
    expect(await run('asset_get', { vaultId: vault.id, assetId: asset.id, includeData: true }))
      .toMatchObject({ assetId: asset.id, byteLength: 3, dataBase64: 'AQID' })
    await run('asset_remove', { vaultId: vault.id, assetId: asset.id })
  })

  it('writes native document links and file attachments with service hard validation', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const source = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Source' },
    }) as { id: string }
    const target = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Target' },
    }) as { id: string }
    const asset = await run('asset_import', {
      vaultId: vault.id, documentId: source.id, mimeType: 'text/plain',
      fileName: 'notes.txt', dataBase64: 'AQID',
    }) as { id: string; byteLength: number; mimeType: string; fileName: string }
    expect(asset).toMatchObject({ byteLength: 3, mimeType: 'text/plain', fileName: 'notes.txt' })
    await run('document_insert', {
      vaultId: vault.id, documentId: source.id,
      nodes: [
        { type: 'paragraph', content: [{
          type: 'documentReference', attrs: { documentId: target.id, label: 'Target' },
        }] },
        { type: 'fileAttachment', attrs: {
          assetId: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, size: asset.byteLength,
        } },
      ],
    })
    const loaded = await run('document_get', {
      vaultId: vault.id, documentId: source.id,
    }) as { content: { content: Array<{ type: string; attrs?: Record<string, unknown> }> } }
    expect(loaded.content.content.map((node) => node.type)).toEqual([
      'paragraph', 'paragraph', 'fileAttachment',
    ])
    await expect(run('tree_delete', {
      vaultId: vault.id, entryId: target.id, confirm: true,
    })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(run('asset_remove', { vaultId: vault.id, assetId: asset.id }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(run('asset_import', {
      vaultId: vault.id, documentId: source.id, mimeType: 'text/plain',
      fileName: '../escape.txt', dataBase64: 'AQID',
    })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_VAULT' })
  })

  it('rejects malformed, ownerless, referenced, and cross-vault asset operations', async () => {
    const first = await run('vault_create', { name: 'First' }) as { id: string }
    const second = await run('vault_create', { name: 'Second' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: first.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }
    await expect(run('asset_import', {
      vaultId: first.id, documentId: document.id, mimeType: 'image/png', dataBase64: 'not-base64!',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const oversized = Buffer.alloc(16 * 1024 * 1024 + 1).toString('base64')
    await expect(run('asset_import', {
      vaultId: first.id, documentId: document.id, mimeType: 'image/png', dataBase64: oversized,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(run('asset_import', {
      vaultId: first.id, documentId: NODE_ID, mimeType: 'image/png', dataBase64: 'AQID',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const asset = await run('asset_import', {
      vaultId: first.id, documentId: document.id, mimeType: 'image/png', dataBase64: 'AQID',
    }) as { id: string }
    await expect(run('asset_get', { vaultId: second.id, assetId: asset.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
    await run('document_insert', {
      vaultId: first.id, documentId: document.id,
      nodes: [{ type: 'assetImage', attrs: { nodeId: NODE_ID, assetId: asset.id } }],
    })
    await expect(run('asset_remove', { vaultId: first.id, assetId: asset.id }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
    await run('document_delete', { vaultId: first.id, documentId: document.id, nodeIds: [NODE_ID] })
    await run('asset_remove', { vaultId: first.id, assetId: asset.id })
  })

  it('maps canvas writes to elements, z-order, appState, and files', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const canvas = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'canvas', title: 'Board' },
    }) as { id: string }
    await run('canvas_insert', {
      vaultId: vault.id, canvasId: canvas.id,
      elements: [
        element('back', 'text', { text: 'needle', originalText: 'needle' }),
        element('front', 'rectangle'),
      ],
      placement: { position: 'front' },
    })
    await run('canvas_update', {
      vaultId: vault.id, canvasId: canvas.id,
      update: {
        elementUpdates: [{ elementId: 'back', set: { strokeColor: '#123' } }],
        elementOrder: ['front', 'back'],
        appState: { set: { viewBackgroundColor: '#fff' } },
      },
    })
    expect(await run('canvas_search', {
      vaultId: vault.id, canvasId: canvas.id, query: 'needle',
    })).toMatchObject({ hits: [{ element: { id: 'back', strokeColor: '#123' }, zIndex: 1 }] })
    await run('canvas_delete', { vaultId: vault.id, canvasId: canvas.id, elementIds: ['front'] })
    expect(await run('canvas_get', { vaultId: vault.id, canvasId: canvas.id }))
      .toMatchObject({ appState: { viewBackgroundColor: '#fff' }, elements: [{ id: 'back' }] })
  })

  it('hard-validates every mutated domain aggregate before persistence', async () => {
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }
    const canvas = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'canvas', title: 'Board' },
    }) as { id: string }

    // `run` intentionally bypasses the MCP input schema here to prove the service is authoritative.
    await expect(run('canvas_insert', {
      vaultId: vault.id, canvasId: canvas.id,
      elements: [{ id: 'incomplete', type: 'rectangle' }],
      placement: { position: 'front' },
    })).rejects.toMatchObject({ code: 'CORRUPT_DATA' })
    expect(await run('canvas_get', { vaultId: vault.id, canvasId: canvas.id }))
      .toMatchObject({ elements: [] })

    await run('canvas_insert', {
      vaultId: vault.id, canvasId: canvas.id,
      elements: [element('shape', 'rectangle')], placement: { position: 'front' },
    })
    await expect(run('canvas_update', {
      vaultId: vault.id, canvasId: canvas.id,
      update: { elementUpdates: [{ elementId: 'shape', unset: ['x'] }] },
    })).rejects.toMatchObject({ code: 'CORRUPT_DATA' })
    expect(await run('canvas_get', { vaultId: vault.id, canvasId: canvas.id }))
      .toMatchObject({ elements: [{ id: 'shape', x: 0 }] })

    const map = await run('mindmap_create', {
      vaultId: vault.id, documentId: document.id,
      data: { nodeData: { id: 'root', topic: 'Root' } },
    }) as { id: string }
    await expect(run('mindmap_update', {
      vaultId: vault.id, mindMapId: map.id,
      updates: [{ nodeId: 'root', set: { topic: 42 } }],
    })).rejects.toMatchObject({ code: 'CORRUPT_DATA' })
    expect(await run('mindmap_get', { vaultId: vault.id, mindMapId: map.id }))
      .toMatchObject({ nodeData: { id: 'root', topic: 'Root' } })
    await expect(run('mindmap_insert', {
      vaultId: vault.id, mindMapId: map.id, parentNodeId: 'root',
      nodes: [{ id: 'root', topic: 'Duplicate' }],
    })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('serializes renderer and MCP writes through the same vault queue', async () => {
    const events: string[] = []
    service.subscribe((event) => events.push(`${event.origin}:${event.change}`))
    const vault = await run('vault_create', { name: 'V' }) as { id: string }
    const document = await run('tree_insert', {
      vaultId: vault.id, entry: { kind: 'document', title: 'Note' },
    }) as { id: string }
    await run('document_insert', {
      vaultId: vault.id, documentId: document.id,
      nodes: [{ type: 'paragraph', attrs: { nodeId: NODE_ID }, content: [{ type: 'text', text: 'before' }] }],
    })

    await Promise.all([
      service.updateDocumentNodeBatch(vault.id, document.id, [{
        nodeId: NODE_ID, attrs: { set: { textAlign: 'right' } },
      }], 'renderer'),
      run('document_update', {
        vaultId: vault.id, documentId: document.id,
        updates: [{ nodeId: NODE_ID, content: [{ type: 'text', text: 'after' }] }],
      }),
    ])

    const [snapshot] = await service.getDocumentNodeSnapshots(vault.id, document.id, [NODE_ID])
    expect(snapshot.node).toMatchObject({
      attrs: { nodeId: NODE_ID, textAlign: 'right' },
      content: [{ type: 'text', text: 'after' }],
    })
    expect(events).toContain('renderer:updated')
    expect(events).toContain('mcp:updated')
  })
})
