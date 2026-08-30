import { describe, expect, it, vi } from 'vitest'
import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir'
import {
  copyMindMapNodesById,
  insertMindMapNodeAndEdit,
  isContinuousSiblingSelection,
  mergeNodeStylePatch,
  resolveRelationTarget,
  updateMindMapSummaryStyle,
} from './mindMapCommands'

function topics(ids: string[], selected: string[]): Topic[] {
  const parent: NodeObj = { id: 'parent', topic: 'Parent', children: ids.map((id) => ({ id, topic: id })) }
  parent.children!.forEach((node) => { node.parent = parent })
  return selected.map((id) => ({ nodeObj: parent.children!.find((node) => node.id === id)! }) as Topic)
}

describe('mind map UI command guards', () => {
  it('patches only explicit style fields and preserves existing presentation fields', () => {
    const node: NodeObj = { id: 'node', topic: 'Node', note: 'keep', style: { color: '#111', fontWeight: '400' } }
    expect(mergeNodeStylePatch(node, { fontWeight: '700' })).toEqual({ style: { color: '#111', fontWeight: '700' } })
    expect(node).toMatchObject({ topic: 'Node', note: 'keep', style: { fontWeight: '400' } })
  })

  it('creates relations only for a distinct target and cancellation never mutates', () => {
    const mode = { sourceId: 'a', bidirectional: true }
    expect(resolveRelationTarget(mode, 'a')).toBeNull()
    expect(resolveRelationTarget(null, 'b')).toBeNull()
    expect(resolveRelationTarget(mode, 'b')).toEqual({ fromId: 'a', toId: 'b', bidirectional: true })
  })

  it('accepts only continuous siblings for summaries', () => {
    expect(isContinuousSiblingSelection(topics(['a', 'b', 'c'], ['a', 'b']))).toBe(true)
    expect(isContinuousSiblingSelection(topics(['a', 'b', 'c'], ['a', 'c']))).toBe(false)
    expect(isContinuousSiblingSelection(topics(['a', 'b'], ['a']))).toBe(false)
  })

  it('updates only native summary style fields, redraws, reselects, and emits one operation', () => {
    const summary = { id: 'summary-1', label: '说明', parent: 'parent', start: 0, end: 1, style: { stroke: '#111' } }
    const rendered = Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'g'), { summaryObj: summary })
    const summarySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    summarySvg.appendChild(rendered)
    const instance = {
      summaries: [summary],
      summarySvg,
      linkDiv: vi.fn(),
      selectSummary: vi.fn(),
      bus: { fire: vi.fn() },
    } as unknown as MindElixirInstance

    expect(updateMindMapSummaryStyle(instance, summary.id, { labelColor: '#2563eb' })).toBe(rendered)
    expect(summary).toMatchObject({ label: '说明', parent: 'parent', start: 0, end: 1, style: { stroke: '#111', labelColor: '#2563eb' } })
    expect(instance.linkDiv).toHaveBeenCalledOnce()
    expect(instance.selectSummary).toHaveBeenCalledWith(rendered)
    expect(instance.bus.fire).toHaveBeenCalledWith('operation', { name: 'finishEditSummary', obj: summary })
  })

  it('delegates insertion and inline editing to one native engine operation', async () => {
    const calls: string[] = []
    const target = { nodeObj: { id: 'target', topic: 'Target' } } as Topic
    const created = { nodeObj: { id: 'created', topic: 'New' } } as Topic
    const instance = {
      currentNode: target,
      insertSibling: vi.fn(async () => {
        calls.push('native-insert')
        instance.currentNode = created
      }),
    } as unknown as MindElixirInstance

    await expect(insertMindMapNodeAndEdit(instance, target, 'sibling-after')).resolves.toBe(created)
    expect(instance.insertSibling).toHaveBeenCalledWith('after', target)
    expect(calls).toEqual(['native-insert'])
  })

  it('rejects copying a node into itself or its descendant before calling the engine', async () => {
    const root: NodeObj = { id: 'root', topic: 'Root' }
    const parent: NodeObj = { id: 'parent', topic: 'Parent', parent: root }
    const child: NodeObj = { id: 'child', topic: 'Child', parent }
    root.children = [parent]
    parent.children = [child]
    const topicById = new Map([
      ['root', { nodeObj: root } as Topic],
      ['parent', { nodeObj: parent } as Topic],
      ['child', { nodeObj: child } as Topic],
    ])
    const instance = {
      nodeData: root,
      findEle: vi.fn((id: string) => topicById.get(id)),
      copyNodes: vi.fn(),
    } as unknown as MindElixirInstance

    await expect(copyMindMapNodesById(instance, ['parent'], 'parent')).resolves.toBe(false)
    await expect(copyMindMapNodesById(instance, ['parent'], 'child')).resolves.toBe(false)
    await expect(copyMindMapNodesById(instance, ['child'], 'root')).resolves.toBe(true)
    expect(instance.copyNodes).toHaveBeenCalledOnce()
  })
})
