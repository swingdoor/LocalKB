import { describe, expect, it } from 'vitest'
import type { DocumentSummary, VaultStructure } from '@shared/types'
import {
  applyOptimisticMove,
  buildTreeData,
  countDescendantContent,
  getAncestorGroupIds,
  getDocumentBreadcrumb,
  isInvalidMove,
} from './structureTree'

const GROUP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GROUP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DOC_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DOC_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const structure: VaultStructure = {
  version: 1,
  entries: [
    { kind: 'group', id: GROUP_A, name: '项目', parentId: null, order: 0 },
    { kind: 'group', id: GROUP_B, name: '资料', parentId: GROUP_A, order: 0 },
    { kind: 'document', id: DOC_A, parentId: GROUP_B, order: 0 },
    { kind: 'document', id: DOC_B, parentId: null, order: 1 },
  ],
}

const documents: DocumentSummary[] = [
  { id: DOC_A, title: '说明', type: 'document', createdAt: '', updatedAt: '' },
  { id: DOC_B, title: '草图', type: 'drawing', createdAt: '', updatedAt: '' },
]

describe('structure tree adapter', () => {
  it('joins summaries and always gives groups children', () => {
    const tree = buildTreeData(structure, documents)
    expect(tree[0]).toMatchObject({ kind: 'group', name: '项目' })
    expect(tree[0]).toHaveProperty('children')
    expect((tree[0] as any).children[0]).toHaveProperty('children')
    expect((tree[0] as any).children[0].children[0]).not.toHaveProperty('children')
  })

  it('derives deep breadcrumbs, root placement, and missing ancestors safely', () => {
    expect(getAncestorGroupIds(structure, DOC_A)).toEqual([GROUP_A, GROUP_B])
    expect(getDocumentBreadcrumb(structure, DOC_A)).toBe('项目 / 资料')
    expect(getDocumentBreadcrumb(structure, DOC_B)).toBe('')
    expect(getAncestorGroupIds({
      version: 1,
      entries: [{ kind: 'document', id: DOC_A, parentId: GROUP_B, order: 0 }],
    }, DOC_A)).toEqual([])
  })

  it('keeps duplicate titles distinguishable by id and breadcrumb', () => {
    const sameTitles = documents.map((document) => ({ ...document, title: '同名文档' }))
    const tree = buildTreeData(structure, sameTitles)
    expect(JSON.stringify(tree)).toContain(DOC_A)
    expect(JSON.stringify(tree)).toContain(DOC_B)
    expect(getDocumentBreadcrumb(structure, DOC_A)).toBe('项目 / 资料')
    expect(getDocumentBreadcrumb(structure, DOC_B)).toBe('')
  })

  it('counts recursive content and identifies cycle drops', () => {
    expect(countDescendantContent(structure, GROUP_A)).toBe(1)
    expect(countDescendantContent(structure, GROUP_B)).toBe(1)
    expect(isInvalidMove(structure, GROUP_A, GROUP_B)).toBe(true)
    expect(isInvalidMove(structure, DOC_B, GROUP_B)).toBe(false)
  })

  it('moves a single node optimistically while preserving mixed order', () => {
    const next = applyOptimisticMove(structure, {
      kind: 'document', id: DOC_B, targetParentId: GROUP_B, index: 0,
    })
    const children = next.entries
      .filter((entry) => entry.parentId === GROUP_B)
      .sort((a, b) => a.order - b.order)
    expect(children.map((entry) => entry.id)).toEqual([DOC_B, DOC_A])
  })
})
