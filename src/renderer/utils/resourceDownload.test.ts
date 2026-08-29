import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCanvasReference, downloadMindMapReference } from './resourceDownload'

const mocks = vi.hoisted(() => ({
  exportToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  mindInit: vi.fn(),
  mindExport: vi.fn(async () => new Blob(['mindmap'], { type: 'image/png' })),
  mindDestroy: vi.fn(),
}))

vi.mock('@excalidraw/excalidraw', () => ({ exportToBlob: mocks.exportToBlob }))
vi.mock('mind-elixir', () => ({
  default: class {
    init = mocks.mindInit
    exportPng = mocks.mindExport
    destroy = mocks.mindDestroy
  },
}))

describe('resource menu downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      knowledge: {
        getCanvas: vi.fn(async () => ({ ok: true, data: {
          type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
        } })),
        getMindMap: vi.fn(async () => ({ ok: true, data: {
          nodeData: { id: 'root', topic: '中心主题', children: [] },
        } })),
      },
      file: { downloadImage: vi.fn(async () => ({ canceled: false })) },
    } as any
  })

  it('exports a canvas through Excalidraw and the existing Electron save dialog', async () => {
    await expect(downloadCanvasReference('vault', 'document', 'canvas')).resolves.toBe(true)
    expect(window.electronAPI.knowledge.getCanvas).toHaveBeenCalledWith('vault', 'canvas', 'document')
    expect(mocks.exportToBlob).toHaveBeenCalledOnce()
    expect(window.electronAPI.file.downloadImage).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
      '画布.png',
    )
  })

  it('exports a mind map and always destroys its temporary renderer', async () => {
    await expect(downloadMindMapReference('vault', 'document', 'mindmap')).resolves.toBe(true)
    expect(window.electronAPI.knowledge.getMindMap).toHaveBeenCalledWith('vault', 'document', 'mindmap')
    expect(mocks.mindInit).toHaveBeenCalledOnce()
    expect(mocks.mindExport).toHaveBeenCalledOnce()
    expect(mocks.mindDestroy).toHaveBeenCalledOnce()
    expect(document.body.querySelector('[style*="-10000px"]')).toBeNull()
  })
})
