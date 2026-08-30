import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArrowSvg, SummarySvg, Topic } from 'mind-elixir'
import type { MindMapData } from '@shared/knowledge-types'
import { createEditableMindMap, finishMindMapArrowControl, type MindMapSurface } from './mindElixirAdapter'
import {
  createMindMapSummaryByIds,
  removeMindMapArrowById,
  removeMindMapSummaryById,
  updateMindMapArrowById,
  updateMindMapSummaryStyle,
} from './mindMapCommands'

function pointer(type: string, options: { x?: number; y?: number; id?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: options.x, clientY: options.y })
  Object.defineProperties(event, {
    pointerId: { value: options.id ?? 1 },
    pointerType: { value: 'mouse' },
  })
  return event
}

describe('Mind Elixir 5.15.1 interaction characterization', () => {
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
    if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = vi.fn()
    if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = vi.fn()
    if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
  })

  afterEach(() => {
    surface?.dispose()
    host.remove()
    vi.restoreAllMocks()
  })

  function createSurface() {
    const data = {
      nodeData: {
        id: 'root', topic: '中心主题',
        children: [{ id: 'a', topic: '节点 A' }, { id: 'b', topic: '节点 B' }],
      },
      arrows: [{ id: 'arrow-a', label: '关联', from: 'a', to: 'b', delta1: { x: 80, y: 0 }, delta2: { x: -80, y: 0 } }],
      summaries: [{ id: 'summary-a', label: '概要', parent: 'root', start: 0, end: 1 }],
    } as MindMapData
    surface = createEditableMindMap(host, data)
    return surface.instance
  }

  it('emits mutually exclusive node, arrow and summary selections', () => {
    const mind = createSurface()
    const events: string[] = []
    mind.bus.addListener('selectNodes', () => events.push('nodes'))
    mind.bus.addListener('selectArrow', () => events.push('arrow'))
    mind.bus.addListener('selectSummary', () => events.push('summary'))
    const node = mind.findEle('a') as Topic
    const arrow = mind.arrowSvg.querySelector<ArrowSvg>(':scope > g')!
    const summary = mind.summarySvg.querySelector<SummarySvg>(':scope > g')!

    mind.clearSelection(); mind.selectNode(node)
    expect(mind.currentNodes.map((topic) => topic.nodeObj.id)).toEqual(['a'])
    expect(mind.currentArrow).toBeNull()
    expect(mind.currentSummary).toBeNull()

    mind.clearSelection(); mind.selectArrow(arrow)
    expect(mind.currentNodes).toHaveLength(0)
    expect(mind.currentArrow?.arrowObj.id).toBe('arrow-a')
    expect(mind.currentSummary).toBeNull()

    mind.clearSelection(); mind.selectSummary(summary)
    expect(mind.currentNodes).toHaveLength(0)
    expect(mind.currentArrow).toBeNull()
    expect(mind.currentSummary?.summaryObj.id).toBe('summary-a')
    expect(events).toEqual(['nodes', 'arrow', 'summary'])
  })

  it('selects a native node from a complete primary pointer sequence', () => {
    const mind = createSurface()
    const node = mind.findEle('a') as Topic
    node.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
    node.dispatchEvent(pointer('pointerup', { x: 10, y: 10 }))
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(mind.currentNodes.map((topic) => topic.nodeObj.id)).toEqual(['a'])
  })

  it('keeps native node drag, box selection and Space pan sequences mutually exclusive', () => {
    const mind = createSurface()
    const node = mind.findEle('a') as Topic

    node.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, id: 11 }))
    expect(mind.ptState).toBe(3)
    node.dispatchEvent(pointer('pointercancel', { x: 10, y: 10, id: 11 }))
    expect(mind.ptState).toBe(0)

    mind.container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20, id: 12 }))
    expect(mind.ptState).toBe(5)
    mind.container.dispatchEvent(pointer('pointercancel', { x: 20, y: 20, id: 12 }))
    expect(mind.ptState).toBe(0)

    const move = vi.spyOn(mind, 'move').mockReturnValue(true)
    mind.container.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' }))
    node.dispatchEvent(pointer('pointerdown', { x: 30, y: 30, id: 13 }))
    expect(mind.ptState).toBe(4)
    node.dispatchEvent(pointer('pointermove', { x: 55, y: 45, id: 13 }))
    node.dispatchEvent(pointer('pointerup', { x: 55, y: 45, id: 13 }))
    mind.container.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Space', key: ' ' }))
    expect(move).toHaveBeenCalledWith(25, 15)
    expect(mind.ptState).toBe(0)
    expect(mind.spacePressed).toBe(false)
  })

  it('delegates node text editing to the native double-pointer sequence', async () => {
    const mind = createSurface()
    const node = mind.findEle('a') as Topic

    node.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, id: 21 }))
    node.dispatchEvent(pointer('pointerup', { x: 10, y: 10, id: 21 }))
    await new Promise((resolve) => setTimeout(resolve, 2))
    node.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, id: 21 }))
    node.dispatchEvent(pointer('pointerup', { x: 10, y: 10, id: 21 }))

    expect(mind.container.querySelector('#input-box')).toBeTruthy()
  })

  it('lets the native curve controller own a full pointer sequence and persist delta', () => {
    const mind = createSurface()
    const arrow = mind.arrowSvg.querySelector<ArrowSvg>(':scope > g')!
    const operations: string[] = []
    mind.bus.addListener('operation', (operation) => operations.push(operation.name))
    mind.clearSelection(); mind.selectArrow(arrow)
    const before = { ...arrow.arrowObj.delta1! }

    mind.P2.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
    mind.map.dispatchEvent(pointer('pointermove', { x: 45, y: 25 }))
    mind.map.dispatchEvent(pointer('pointerup', { x: 45, y: 25 }))

    expect(arrow.arrowObj.delta1).toEqual({ x: before.x + 35, y: before.y + 15 })
    expect(operations).toEqual(['reshapeArrow'])
  })

  it('finishes the native curve helper when a pointer sequence is cancelled', () => {
    const mind = createSurface()
    const arrow = mind.arrowSvg.querySelector<ArrowSvg>(':scope > g')!
    const operations: string[] = []
    mind.bus.addListener('operation', (operation) => operations.push(operation.name))
    mind.clearSelection(); mind.selectArrow(arrow)

    mind.P2.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, id: 25 }))
    mind.map.dispatchEvent(pointer('pointermove', { x: 30, y: 20, id: 25 }))
    expect(mind.helper1?.pointerdown).toBe(true)
    finishMindMapArrowControl(mind)

    expect(mind.helper1?.pointerdown).toBe(false)
    expect(operations).toEqual(['reshapeArrow'])
  })

  it('reshapeArrow updates an endpoint, redraws and emits one operation', () => {
    const mind = createSurface()
    const arrow = mind.arrows[0]
    const rendered = mind.arrowSvg.querySelector<ArrowSvg>(':scope > g')!
    const operations: string[] = []
    mind.bus.addListener('operation', (operation) => operations.push(operation.name))
    mind.selectArrow(rendered)
    mind.reshapeArrow(arrow, { from: 'root' })

    expect(arrow.from).toBe('root')
    expect(mind.arrowSvg.querySelector<ArrowSvg>(':scope > g')?.arrowObj).toBe(arrow)
    expect(mind.currentArrow?.arrowObj.id).toBe('arrow-a')
    expect(operations).toEqual(['reshapeArrow'])
  })

  it('creates a Chinese summary for continuous siblings and selects it as the only object', () => {
    const mind = createSurface()
    mind.summaries = []
    mind.renderSummary()
    const operations: string[] = []
    mind.bus.addListener('operation', (operation) => operations.push(operation.name))

    const summary = createMindMapSummaryByIds(mind, ['b', 'a'])

    expect(summary).toMatchObject({ label: '概要', parent: 'root', start: 0, end: 1 })
    expect(mind.currentNodes).toHaveLength(0)
    expect(mind.currentArrow).toBeNull()
    expect(mind.currentSummary?.summaryObj.id).toBe(summary?.id)
    expect(mind.container.querySelector('#input-box')).toBeTruthy()
    expect(operations).toEqual(['createSummary'])
  })

  it('styles and deletes arrows and summaries through explicit IDs without changing unrelated fields', () => {
    const mind = createSurface()
    const arrowBefore = structuredClone(mind.arrows[0])
    const operations: string[] = []
    mind.bus.addListener('operation', (operation) => operations.push(operation.name))

    expect(updateMindMapArrowById(mind, 'arrow-a', { style: { stroke: '#2563eb' } })).toMatchObject({
      id: 'arrow-a', from: arrowBefore.from, to: arrowBefore.to, label: arrowBefore.label,
      delta1: arrowBefore.delta1, delta2: arrowBefore.delta2, style: { stroke: '#2563eb' },
    })
    expect(updateMindMapSummaryStyle(mind, 'summary-a', { labelColor: '#16a34a' })?.summaryObj).toMatchObject({
      id: 'summary-a', label: '概要', parent: 'root', start: 0, end: 1,
      style: { labelColor: '#16a34a' },
    })
    expect(removeMindMapArrowById(mind, 'arrow-a')).toBe(true)
    expect(removeMindMapSummaryById(mind, 'summary-a')).toBe(true)
    expect(mind.arrows).toHaveLength(0)
    expect(mind.summaries).toHaveLength(0)
    expect(operations).toEqual(['reshapeArrow', 'finishEditSummary', 'removeArrow', 'removeSummary'])
  })
})
