import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MindMapData } from '@shared/knowledge-types'
import { createEditableMindMap, type MindMapSurface } from './mindElixirAdapter'

describe('Mind Elixir public node operations', () => {
  let host: HTMLDivElement
  let surface: MindMapSurface | null

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'))
    surface = null
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600,
      x: 0, y: 0, toJSON: () => ({}),
    })
  })

  afterEach(() => {
    surface?.dispose()
    host.remove()
    vi.restoreAllMocks()
  })

  it('inserts a sibling around one explicitly targeted non-root topic', async () => {
    const data = {
      nodeData: {
        id: 'root', topic: '中心主题',
        children: [{ id: 'child', topic: '已有节点' }],
      },
    } as MindMapData
    surface = createEditableMindMap(host, data)
    const child = surface.instance.findEle('child')

    surface.instance.selectNode(child)
    await surface.instance.insertSibling('after', child)

    const saved = surface.instance.getData() as unknown as MindMapData
    expect(saved.nodeData.children).toHaveLength(2)
    expect(saved.nodeData.children?.[0].id).toBe('child')
    expect(saved.nodeData.children?.[1].topic).toBe('新节点')
  })
})
