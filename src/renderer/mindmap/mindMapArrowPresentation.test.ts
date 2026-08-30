import { describe, expect, it } from 'vitest'
import type { ArrowSvg, MindElixirInstance } from 'mind-elixir'
import { syncMindMapArrowPresentation } from './mindMapArrowPresentation'

describe('mind map arrow presentation', () => {
  it('marks only the selected native arrow and label without changing arrow data', () => {
    const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const first = document.createElementNS('http://www.w3.org/2000/svg', 'g') as ArrowSvg
    const second = document.createElementNS('http://www.w3.org/2000/svg', 'g') as ArrowSvg
    first.arrowObj = { id: 'arrow-1', label: '关联一', from: 'a', to: 'b' }
    second.arrowObj = { id: 'arrow-2', label: '关联二', from: 'b', to: 'c' }
    first.labelEl = document.createElement('div')
    second.labelEl = document.createElement('div')
    arrowSvg.append(first, second)

    syncMindMapArrowPresentation({ arrowSvg } as MindElixirInstance, 'arrow-2')

    expect(first.hasAttribute('data-mindmap-arrow-selected')).toBe(false)
    expect(first.labelEl.hasAttribute('data-mindmap-arrow-selected')).toBe(false)
    expect(second.hasAttribute('data-mindmap-arrow-selected')).toBe(true)
    expect(second.labelEl.hasAttribute('data-mindmap-arrow-selected')).toBe(true)
    expect(second.arrowObj).toEqual({ id: 'arrow-2', label: '关联二', from: 'b', to: 'c' })
  })
})
