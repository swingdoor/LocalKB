import { describe, expect, it } from 'vitest'
import { resolveMindMapCapabilities } from './mindMapCapabilities'

describe('resolveMindMapCapabilities', () => {
  it('distinguishes root, normal and multi-node constraints', () => {
    const root = resolveMindMapCapabilities({ selection: { type: 'nodes', ids: ['root'] }, rootId: 'root' })
    expect(root.context).toBe('root-node')
    expect(root.canAddChild).toBe(true)
    expect(root.canDelete).toBe(false)
    expect(root.canAddSibling).toBe(false)

    const node = resolveMindMapCapabilities({ selection: { type: 'nodes', ids: ['child'] }, rootId: 'root' })
    expect(node.context).toBe('node')
    expect(node.canDelete).toBe(true)
    expect(node.canEditMetadata).toBe(true)

    const includingRoot = resolveMindMapCapabilities({ selection: { type: 'nodes', ids: ['root', 'child'] }, rootId: 'root', continuousSiblings: true })
    expect(includingRoot.context).toBe('multi-node')
    expect(includingRoot.canStyle).toBe(true)
    expect(includingRoot.canDelete).toBe(false)
    expect(includingRoot.canCreateSummary).toBe(false)
  })

  it('only enables summaries for continuous ordinary siblings', () => {
    const selection = { type: 'nodes' as const, ids: ['a', 'b'] }
    expect(resolveMindMapCapabilities({ selection, rootId: 'root', continuousSiblings: false }).canCreateSummary).toBe(false)
    expect(resolveMindMapCapabilities({ selection, rootId: 'root', continuousSiblings: true }).canCreateSummary).toBe(true)
  })

  it('does not leak node capabilities into arrows or summaries', () => {
    const arrow = resolveMindMapCapabilities({ selection: { type: 'arrow', id: 'arrow' }, rootId: 'root' })
    expect(arrow.context).toBe('arrow')
    expect(arrow.canReconnectArrow).toBe(true)
    expect(arrow.canAddChild).toBe(false)
    const summary = resolveMindMapCapabilities({ selection: { type: 'summary', id: 'summary' }, rootId: 'root' })
    expect(summary.context).toBe('summary')
    expect(summary.canStyle).toBe(true)
    expect(summary.canChangeArrow).toBe(false)
  })
})
