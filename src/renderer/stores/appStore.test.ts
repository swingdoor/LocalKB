import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentSummary, StructureResult, VaultStructure } from '@shared/types'
import { useAppStore } from './appStore'

const VAULT_A = { id: '11111111-1111-4111-8111-111111111111', name: 'A', createdAt: '' }
const VAULT_B = { id: '22222222-2222-4222-8222-222222222222', name: 'B', createdAt: '' }
const GROUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOCUMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const structure: VaultStructure = {
  version: 1,
  entries: [
    { kind: 'group', id: GROUP, name: '组', parentId: null, order: 0 },
    { kind: 'document', id: DOCUMENT, parentId: null, order: 1 },
  ],
}

describe('appStore structure state', () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.setState({
      currentVault: VAULT_A,
      documents: [],
      structure,
      structureLoading: false,
      structureError: null,
      expandedGroupIds: [],
    })
  })

  it('applies a single move optimistically and rolls back a stable failure', async () => {
    let resolveMove!: (value: StructureResult<VaultStructure>) => void
    const move = vi.fn(() => new Promise<StructureResult<VaultStructure>>((resolve) => {
      resolveMove = resolve
    }))
    window.electronAPI = { structure: { move } } as any

    const pending = useAppStore.getState().moveStructure({
      kind: 'document', id: DOCUMENT, targetParentId: GROUP, index: 0,
    })
    expect(useAppStore.getState().structure?.entries.find(
      (entry) => entry.id === DOCUMENT,
    )?.parentId).toBe(GROUP)

    resolveMove({
      success: false,
      error: { code: 'GROUP_CYCLE', message: '移动失败' },
    })
    expect(await pending).toBe(false)
    expect(useAppStore.getState().structure).toEqual(structure)
    expect(useAppStore.getState().structureError).toBe('移动失败')
  })

  it('does not apply a completed load from the previously selected vault', async () => {
    let resolveOldDocuments!: (value: DocumentSummary[]) => void
    let resolveOldStructure!: (value: StructureResult<VaultStructure>) => void
    const oldDocuments = new Promise<DocumentSummary[]>((resolve) => {
      resolveOldDocuments = resolve
    })
    const oldStructure = new Promise<StructureResult<VaultStructure>>((resolve) => {
      resolveOldStructure = resolve
    })
    const newSummary: DocumentSummary = {
      id: DOCUMENT, title: 'B 文档', type: 'document', createdAt: '', updatedAt: '',
    }
    window.electronAPI = {
      document: {
        list: vi.fn((vaultId: string) => vaultId === VAULT_A.id ? oldDocuments : [newSummary]),
      },
      structure: {
        get: vi.fn((vaultId: string) => vaultId === VAULT_A.id
          ? oldStructure
          : { success: true, data: structure }),
      },
    } as any

    const oldLoad = useAppStore.getState().loadDocuments(VAULT_A.id)
    useAppStore.setState({ currentVault: VAULT_B })
    await useAppStore.getState().loadDocuments(VAULT_B.id)
    resolveOldDocuments([])
    resolveOldStructure({ success: true, data: { version: 1, entries: [] } })
    await oldLoad

    expect(useAppStore.getState().currentVault?.id).toBe(VAULT_B.id)
    expect(useAppStore.getState().documents).toEqual([newSummary])
    expect(useAppStore.getState().structure).toEqual(structure)
  })

  it('restores only valid expanded groups and expands ancestors for search reveal', async () => {
    const nested: VaultStructure = {
      version: 1,
      entries: [
        { kind: 'group', id: GROUP, name: '组', parentId: null, order: 0 },
        { kind: 'document', id: DOCUMENT, parentId: GROUP, order: 0 },
      ],
    }
    localStorage.setItem(
      `localkb-expanded-groups:${VAULT_A.id}`,
      JSON.stringify([GROUP, 'removed-group']),
    )
    window.electronAPI = {
      document: { list: vi.fn(() => []) },
      structure: { get: vi.fn(() => ({ success: true, data: nested })) },
    } as any

    await useAppStore.getState().loadDocuments(VAULT_A.id)
    expect(useAppStore.getState().expandedGroupIds).toEqual([GROUP])
    useAppStore.getState().setGroupExpanded(GROUP, false)
    expect(JSON.parse(localStorage.getItem(`localkb-expanded-groups:${VAULT_A.id}`)!))
      .toEqual([])
    useAppStore.getState().revealDocument(DOCUMENT)
    expect(useAppStore.getState().expandedGroupIds).toEqual([GROUP])
    expect(useAppStore.getState().revealDocumentId).toBe(DOCUMENT)
  })
})
