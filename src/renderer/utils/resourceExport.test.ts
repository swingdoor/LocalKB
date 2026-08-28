import { describe, expect, it, vi } from 'vitest'
import { resolveResourceReferencesForExport } from './resourceExport'

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
})
