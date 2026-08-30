import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownExportSnapshot } from '@shared/markdown-export-types'
import { exportDocumentMarkdown } from './exportDocumentMarkdown'

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const CANVAS_ID = '00000000-0000-4000-8000-000000000010'
const NODE_A = '00000000-0000-4000-8000-000000000011'
const NODE_B = '00000000-0000-4000-8000-000000000012'

const mocks = vi.hoisted(() => ({
  serialize: vi.fn(() => '# JSON snapshot\n'),
  exportToBlob: vi.fn(async () => ({
    arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
  })),
  mindmap: vi.fn(),
}))

vi.mock('./markdownSerializer', () => ({ serializeDocumentMarkdown: mocks.serialize }))
vi.mock('@excalidraw/excalidraw', () => ({ exportToBlob: mocks.exportToBlob }))
vi.mock('../mindmap/mindMapExport', () => ({ renderMindMapStatic: mocks.mindmap }))

function snapshot(): MarkdownExportSnapshot {
  return {
    document: {
      type: 'doc',
      content: [
        { type: 'canvasReference', attrs: { nodeId: NODE_A, canvasId: CANVAS_ID } },
        { type: 'canvasReference', attrs: { nodeId: NODE_B, canvasId: CANVAS_ID } },
      ],
    },
    metadata: {
      vaultId: '00000000-0000-4000-8000-000000000001',
      documentId: '00000000-0000-4000-8000-000000000002',
      title: '文档',
      createdAt: '2026-08-30T01:02:03.000Z',
      updatedAt: '2026-08-30T01:02:03.000Z',
    },
  }
}

function readyBegin() {
  const resourceKey = `canvas:${CANVAS_ID}`
  return {
    canceled: false as const,
    exportId: 'export-id',
    warnings: [],
    manifest: {
      assetDirectoryName: '文档.assets',
      nodeResources: { [NODE_A]: resourceKey, [NODE_B]: resourceKey },
      resources: {
        [resourceKey]: {
          resourceKey,
          kind: 'canvas' as const,
          nodeIds: [NODE_A, NODE_B],
          label: '画布',
          status: 'ready' as const,
          mimeType: 'image/png',
          relativePath: '文档.assets/canvases/canvas.png',
        },
      },
    },
  }
}

describe('exportDocumentMarkdown coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders each unique resource once and commits the fixed JSON snapshot', async () => {
    const beginMarkdownExport = vi.fn(async () => readyBegin())
    const commitMarkdownExport = vi.fn(async () => ({
      success: true, revealId: 'export-id', warningCount: 0, warnings: [],
    }))
    const getCanvas = vi.fn(async () => ({
      ok: true,
      data: {
        type: 'excalidraw', version: 2, source: 'localkb',
        elements: [{ id: 'full-scene-element', type: 'rectangle' }], appState: {}, files: {},
      },
    }))
    window.electronAPI = {
      file: { beginMarkdownExport, commitMarkdownExport },
      knowledge: { getCanvas },
    } as any

    const result = await exportDocumentMarkdown({} as any, snapshot())

    expect(result).toMatchObject({ canceled: false })
    expect(beginMarkdownExport.mock.calls[0][0].resources).toHaveLength(1)
    expect(getCanvas).toHaveBeenCalledOnce()
    expect(mocks.exportToBlob).toHaveBeenCalledOnce()
    expect(mocks.exportToBlob).toHaveBeenCalledWith(expect.objectContaining({
      elements: [expect.objectContaining({ id: 'full-scene-element' })],
      exportPadding: 20,
      mimeType: 'image/png',
    }))
    expect(mocks.serialize.mock.calls[0][1]).toEqual(snapshot().document)
    expect(commitMarkdownExport.mock.calls[0][0]).toMatchObject({
      exportId: 'export-id',
      markdown: '# JSON snapshot\n',
      warnings: [],
    })
    expect(commitMarkdownExport.mock.calls[0][0].generatedResources).toEqual([{
      resourceKey: `canvas:${CANVAS_ID}`, mimeType: 'image/png', bytes: PNG,
    }])
  })

  it('isolates rendering failures as manifest warnings', async () => {
    const begin = readyBegin()
    const commitMarkdownExport = vi.fn(async (request) => ({
      success: true, revealId: 'export-id',
      warningCount: request.warnings.length, warnings: request.warnings,
    }))
    window.electronAPI = {
      file: {
        beginMarkdownExport: vi.fn(async () => begin),
        commitMarkdownExport,
      },
      knowledge: { getCanvas: vi.fn(async () => ({ ok: false, error: { message: '画布不存在' } })) },
    } as any

    const result = await exportDocumentMarkdown({} as any, snapshot())

    expect(result).toMatchObject({ canceled: false, result: { warningCount: 1 } })
    expect(begin.manifest.resources[`canvas:${CANVAS_ID}`]).toMatchObject({
      status: 'failed', error: '画布不存在',
    })
    expect(commitMarkdownExport.mock.calls[0][0].generatedResources).toEqual([])
    expect(commitMarkdownExport.mock.calls[0][0].warnings[0]).toMatchObject({ label: '画布' })
  })

  it('stops without serialization or commit when the save dialog is canceled', async () => {
    const commitMarkdownExport = vi.fn()
    window.electronAPI = {
      file: {
        beginMarkdownExport: vi.fn(async () => ({ canceled: true })),
        commitMarkdownExport,
      },
    } as any

    expect(await exportDocumentMarkdown({} as any, snapshot())).toEqual({ canceled: true })
    expect(mocks.serialize).not.toHaveBeenCalled()
    expect(commitMarkdownExport).not.toHaveBeenCalled()
  })
})
