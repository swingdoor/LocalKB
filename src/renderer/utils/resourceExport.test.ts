import { describe, expect, it, vi } from 'vitest'
import { resolveResourceReferencesForExport } from './resourceExport'

const renderMocks = vi.hoisted(() => ({
  render: vi.fn(async (_data: unknown, format: 'png' | 'svg') => format === 'svg'
    ? { text: async () => '<svg xmlns="http://www.w3.org/2000/svg"><text>Map</text></svg>' }
    : new Blob(['png'], { type: 'image/png' })),
}))
vi.mock('../mindmap/mindMapExport', () => ({
  renderMindMapStatic: renderMocks.render,
}))

describe('resource export', () => {
  it('renders descriptive placeholders for missing resources', async () => {
    window.electronAPI = { knowledge: {
      getCanvas: vi.fn(async () => ({
        ok: false, error: { code: 'NOT_FOUND', message: 'missing' },
      })),
      getMindMap: vi.fn(async () => ({
        ok: false, error: { code: 'NOT_FOUND', message: 'missing' },
      })),
    } } as any
    const html = await resolveResourceReferencesForExport(`
      <div data-canvas-reference data-canvas-id="canvas"></div>
      <div data-mindmap-reference data-mindmap-id="mindmap"></div>
    `, 'vault', 'document')

    expect(html).toContain('画布资源不可用')
    expect(html).toContain('思维导图资源不可用')
    expect(html).not.toContain('data-canvas-reference')
    expect(html).not.toContain('data-mindmap-reference')
  })

  it('preserves rich native nodes in PDF HTML', async () => {
    window.electronAPI = { knowledge: {
      getDocument: vi.fn(async () => ({ ok: true, data: { title: '目标文档' } })),
    } } as any
    const html = await resolveResourceReferencesForExport(`
      <span data-document-reference data-document-id="target" data-label="旧标题">旧标题</span>
      <div data-file-attachment data-file-name="notes.txt" data-size="3"></div>
      <details><summary>摘要</summary><div>正文</div></details>
    `, 'vault', 'document')

    expect(html).toContain('文档：目标文档')
    expect(html).toContain('附件：notes.txt（3 字节）')
    expect(html).toContain('<details open="">')
  })

  it('uses the shared snapshot renderer for PDF HTML', async () => {
    const data = { nodeData: { id: 'root', topic: 'Root' } }
    window.electronAPI = { knowledge: {
      getMindMap: vi.fn(async () => ({ ok: true, data })),
    } } as any
    const html = await resolveResourceReferencesForExport(
      '<div data-mindmap-reference data-mindmap-id="map" data-width="480" data-height="260" data-text-align="center"></div>',
      'vault',
      'document',
    )
    expect(html).toContain('<svg')
    expect(html).toContain('data-pdf-resource-frame')
    expect(html).toContain('width: 480px')
    expect(html).toContain('height: 260px')
    expect(html).toContain('overflow: hidden')
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(html).toContain('width:100%;height:100%')
    expect(renderMocks.render).toHaveBeenCalledWith(data, 'svg')
  })
})
