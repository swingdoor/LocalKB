import { describe, expect, it } from 'vitest'
import type { ContentSummary, VaultTreeV3 } from '@shared/knowledge-types'
import {
  applyOptimisticMove,
  buildTreeData,
  countDescendantContent,
  getAncestorGroupIds,
  getContentBreadcrumb,
  isInvalidMove,
} from './structureTree'

const GROUP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GROUP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DOC_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CANVAS_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const timestamp = '2026-01-01T00:00:00.000Z'

const structure: VaultTreeV3 = {
  schemaVersion: 3,
  entries: [
    { kind: 'group', id: GROUP_A, name: '项目', parentId: null, order: 0 },
    { kind: 'group', id: GROUP_B, name: '资料', parentId: GROUP_A, order: 0 },
    {
      kind: 'content', id: DOC_A, contentType: 'document', title: '说明',
      parentId: GROUP_B, order: 0, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      kind: 'content', id: CANVAS_B, contentType: 'canvas', title: '草图',
      parentId: null, order: 1, createdAt: timestamp, updatedAt: timestamp,
    },
  ],
}

const contents: ContentSummary[] = [
  {
    id: DOC_A, title: '说明', contentType: 'document', parentId: GROUP_B,
    order: 0, createdAt: timestamp, updatedAt: timestamp,
  },
  {
    id: CANVAS_B, title: '草图', contentType: 'canvas', parentId: null,
    order: 1, createdAt: timestamp, updatedAt: timestamp,
  },
]

describe('structure tree adapter', () => {
  it('joins mixed content summaries and always gives groups children', () => {
    const tree = buildTreeData(structure, contents)
    expect(tree[0]).toMatchObject({ kind: 'group', name: '项目' })
    expect(tree[0]).toHaveProperty('children')
    expect((tree[0] as any).children[0]).toHaveProperty('children')
    expect((tree[0] as any).children[0].children[0]).toMatchObject({
      kind: 'content', contentType: 'document', id: DOC_A,
    })
    expect(tree[1]).toMatchObject({ kind: 'content', contentType: 'canvas', id: CANVAS_B })
  })

  it('derives deep breadcrumbs, root placement, and missing ancestors safely', () => {
    expect(getAncestorGroupIds(structure, DOC_A)).toEqual([GROUP_A, GROUP_B])
    expect(getContentBreadcrumb(structure, DOC_A)).toBe('项目 / 资料')
    expect(getContentBreadcrumb(structure, CANVAS_B)).toBe('')
    expect(getAncestorGroupIds({
      schemaVersion: 3,
      entries: [{
        kind: 'content', id: DOC_A, contentType: 'document', title: '说明',
        parentId: GROUP_B, order: 0, createdAt: timestamp, updatedAt: timestamp,
      }],
    }, DOC_A)).toEqual([])
  })

  it('keeps duplicate titles distinguishable by id and breadcrumb', () => {
    const sameTitles = contents.map((content) => ({ ...content, title: '同名内容' }))
    const tree = buildTreeData(structure, sameTitles)
    expect(JSON.stringify(tree)).toContain(DOC_A)
    expect(JSON.stringify(tree)).toContain(CANVAS_B)
    expect(getContentBreadcrumb(structure, DOC_A)).toBe('项目 / 资料')
    expect(getContentBreadcrumb(structure, CANVAS_B)).toBe('')
  })

  it('counts recursive content and identifies cycle drops', () => {
    expect(countDescendantContent(structure, GROUP_A)).toBe(1)
    expect(countDescendantContent(structure, GROUP_B)).toBe(1)
    expect(isInvalidMove(structure, GROUP_A, GROUP_B)).toBe(true)
    expect(isInvalidMove(structure, CANVAS_B, GROUP_B)).toBe(false)
  })

  it('moves one content entry optimistically while preserving mixed order', () => {
    const next = applyOptimisticMove(structure, {
      id: CANVAS_B, targetParentId: GROUP_B, index: 0,
    })
    const children = next.entries
      .filter((entry) => entry.parentId === GROUP_B)
      .sort((a, b) => a.order - b.order)
    expect(children.map((entry) => entry.id)).toEqual([CANVAS_B, DOC_A])
    expect(next.schemaVersion).toBe(3)
  })
})
