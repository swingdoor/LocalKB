import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMindMapStatic } from './mindMapExport'
import { MIND_MAP_EXPORT_CSS } from './mindElixirTheme'

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(), exportPng: vi.fn(), exportSvg: vi.fn(), changeTheme: vi.fn(), scaleFit: vi.fn(),
}))
vi.mock('mind-elixir', () => ({
  default: class {
    static SIDE = 2
    init() {}
    destroy = mocks.destroy
    exportPng = mocks.exportPng
    exportSvg = mocks.exportSvg
    changeTheme = mocks.changeTheme
    scaleFit = mocks.scaleFit
  },
}))

describe('mind map static export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exportPng.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    mocks.exportSvg.mockReturnValue(new Blob(['svg'], { type: 'image/svg+xml' }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  })

  it('uses the shared style for PNG and SVG and removes every offscreen surface', async () => {
    await expect(renderMindMapStatic({ nodeData: { id: 'root', topic: 'Root' } }, 'png')).resolves.toBeInstanceOf(Blob)
    await expect(renderMindMapStatic({ nodeData: { id: 'root', topic: 'Root' } }, 'svg')).resolves.toBeInstanceOf(Blob)
    expect(mocks.exportPng).toHaveBeenCalledWith(true, MIND_MAP_EXPORT_CSS)
    expect(mocks.exportSvg).toHaveBeenCalledWith(true, MIND_MAP_EXPORT_CSS)
    expect(mocks.destroy).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-mindmap-offscreen]')).toBeNull()
  })

  it('cleans up after export failure', async () => {
    mocks.exportPng.mockRejectedValueOnce(new Error('snapshot failed'))
    await expect(renderMindMapStatic({ nodeData: { id: 'root', topic: 'Root' } }, 'png')).rejects.toThrow('snapshot failed')
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-mindmap-offscreen]')).toBeNull()
  })
})
