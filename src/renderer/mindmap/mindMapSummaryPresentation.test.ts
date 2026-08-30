import { describe, expect, it } from 'vitest'
import type { MindElixirInstance, SummarySvg, Topic } from 'mind-elixir'
import { syncMindMapSummaryPresentation } from './mindMapSummaryPresentation'

describe('mind map summary presentation', () => {
  it('adds outward visual spacing and selected feedback without changing native data', () => {
    const main = document.createElement('me-main')
    main.className = 'rhs'
    const parent = document.createElement('me-tpc') as Topic
    const child = document.createElement('me-tpc') as Topic
    parent.nodeObj = { id: 'root', topic: 'Root', children: [{ id: 'child', topic: 'Child' }] }
    child.nodeObj = { id: 'child', topic: 'Child', parent: parent.nodeObj }
    main.appendChild(child)

    const summarySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const summary = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SummarySvg
    summary.summaryObj = { id: 'summary-1', label: '说明', parent: 'root', start: 0, end: 0 }
    summary.labelEl = document.createElement('div')
    summarySvg.appendChild(summary)
    const instance = {
      direction: 2,
      summarySvg,
      findEle: (id: string) => id === 'root' ? parent : child,
    } as unknown as MindElixirInstance

    syncMindMapSummaryPresentation(instance, 'summary-1')

    expect(summary.style.transform).toBe('translate(14px, 0px)')
    expect(summary.labelEl.style.transform).toBe('translate(14px, 0px)')
    expect(summary.hasAttribute('data-mindmap-summary-selected')).toBe(true)
    expect(summary.labelEl.hasAttribute('data-mindmap-summary-selected')).toBe(true)
    expect(summary.summaryObj).toEqual({ id: 'summary-1', label: '说明', parent: 'root', start: 0, end: 0 })
  })
})
