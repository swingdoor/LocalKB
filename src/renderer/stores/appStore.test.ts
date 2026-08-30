import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ContentSummary, LoadedCanvas, LoadedDocument, Result, VaultTreeV3, VaultV3,
} from '@shared/knowledge-types'
import { VAULT_FORMAT_VERSIONS } from '@shared/knowledge-types'
import { useAppStore } from './appStore'
import { registerPendingSaveFlusher } from '../utils/pendingSaveCoordinator'

const timestamp = '2026-01-01T00:00:00.000Z'
const VAULT_A: VaultV3 = {
  schemaVersion: 3, formatVersions: VAULT_FORMAT_VERSIONS, id: '11111111-1111-4111-8111-111111111111', name: 'A', createdAt: timestamp,
}
const VAULT_B: VaultV3 = {
  schemaVersion: 3, formatVersions: VAULT_FORMAT_VERSIONS, id: '22222222-2222-4222-8222-222222222222', name: 'B', createdAt: timestamp,
}
const GROUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOCUMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CANVAS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const structure: VaultTreeV3 = {
  schemaVersion: 3,
  entries: [
    { kind: 'group', id: GROUP, name: '组', parentId: null, order: 0 },
    {
      kind: 'content', id: DOCUMENT, contentType: 'document', title: '文档',
      parentId: null, order: 1, createdAt: timestamp, updatedAt: timestamp,
    },
  ],
}
const documentSummary: ContentSummary = {
  id: DOCUMENT, title: '文档', contentType: 'document', parentId: null,
  order: 1, createdAt: timestamp, updatedAt: timestamp,
}
const canvasSummary: ContentSummary = {
  id: CANVAS, title: '画布', contentType: 'canvas', parentId: null,
  order: 2, createdAt: timestamp, updatedAt: timestamp,
}

describe('appStore v3 knowledge state', () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.setState({
      vaults: [VAULT_A, VAULT_B], currentVault: VAULT_A,
      contents: [], structure, selectedContent: null, currentContent: null,
      contentLoading: false, contentError: null,
      structureLoading: false, structureError: null,
      expandedGroupIds: [], revealContentId: null,
    })
  })

  it('applies one move optimistically and rolls back a result failure', async () => {
    let resolveMove!: (value: Result<never>) => void
    const moveTreeEntry = vi.fn(() => new Promise<Result<never>>((resolve) => {
      resolveMove = resolve
    }))
    window.electronAPI = { knowledge: { moveTreeEntry } } as any

    const pending = useAppStore.getState().moveStructure({
      id: DOCUMENT, targetParentId: GROUP, index: 0,
    })
    expect(useAppStore.getState().structure?.entries.find(
      (entry) => entry.id === DOCUMENT,
    )?.parentId).toBe(GROUP)

    resolveMove({ ok: false, error: { code: 'CONFLICT', message: '移动失败' } })
    expect(await pending).toBe(false)
    expect(useAppStore.getState().structure).toEqual(structure)
    expect(useAppStore.getState().structureError).toBe('移动失败')
  })

  it('does not apply a completed load from the previously selected vault', async () => {
    let resolveOldContents!: (value: Result<ContentSummary[]>) => void
    let resolveOldTree!: (value: Result<VaultTreeV3>) => void
    const oldContents = new Promise<Result<ContentSummary[]>>((resolve) => {
      resolveOldContents = resolve
    })
    const oldTree = new Promise<Result<VaultTreeV3>>((resolve) => {
      resolveOldTree = resolve
    })
    window.electronAPI = {
      knowledge: {
        listContent: vi.fn((vaultId: string) => vaultId === VAULT_A.id
          ? oldContents : Promise.resolve({ ok: true, data: [canvasSummary] })),
        getTree: vi.fn((vaultId: string) => vaultId === VAULT_A.id
          ? oldTree : Promise.resolve({ ok: true, data: structure })),
      },
    } as any

    const oldLoad = useAppStore.getState().loadContents(VAULT_A.id)
    useAppStore.setState({ currentVault: VAULT_B })
    await useAppStore.getState().loadContents(VAULT_B.id)
    resolveOldContents({ ok: true, data: [] })
    resolveOldTree({ ok: true, data: { schemaVersion: 3, entries: [] } })
    await oldLoad

    expect(useAppStore.getState().currentVault?.id).toBe(VAULT_B.id)
    expect(useAppStore.getState().contents).toEqual([canvasSummary])
    expect(useAppStore.getState().structure).toEqual(structure)
  })

  it('restores valid expanded groups and expands ancestors for reveal', async () => {
    const nested: VaultTreeV3 = {
      schemaVersion: 3,
      entries: [
        { kind: 'group', id: GROUP, name: '组', parentId: null, order: 0 },
        { ...structure.entries[1], parentId: GROUP, order: 0 },
      ],
    }
    localStorage.setItem(
      `localkb-expanded-groups:${VAULT_A.id}`,
      JSON.stringify([GROUP, 'removed-group']),
    )
    window.electronAPI = { knowledge: {
      listContent: vi.fn(async () => ({ ok: true, data: [documentSummary] })),
      getTree: vi.fn(async () => ({ ok: true, data: nested })),
    } } as any

    await useAppStore.getState().loadContents(VAULT_A.id)
    expect(useAppStore.getState().expandedGroupIds).toEqual([GROUP])
    useAppStore.getState().setGroupExpanded(GROUP, false)
    expect(JSON.parse(localStorage.getItem(`localkb-expanded-groups:${VAULT_A.id}`)!))
      .toEqual([])
    useAppStore.getState().revealContent(DOCUMENT)
    expect(useAppStore.getState().expandedGroupIds).toEqual([GROUP])
    expect(useAppStore.getState().revealContentId).toBe(DOCUMENT)
  })

  it('selects document and canvas summaries through their native APIs', async () => {
    const loadedDocument: LoadedDocument = {
      ...documentSummary, contentType: 'document', content: { type: 'doc', content: [] },
    }
    const loadedCanvas: LoadedCanvas = {
      ...canvasSummary, contentType: 'canvas',
      content: {
        type: 'excalidraw', version: 2, source: 'local', elements: [], appState: {}, files: {},
      },
    }
    const getDocument = vi.fn(async () => ({ ok: true, data: loadedDocument }))
    const getCanvas = vi.fn(async () => ({ ok: true, data: loadedCanvas }))
    window.electronAPI = { knowledge: { getDocument, getCanvas } } as any

    await useAppStore.getState().selectContent(documentSummary)
    expect(useAppStore.getState().currentContent).toEqual(loadedDocument)
    await useAppStore.getState().selectContent(canvasSummary)
    expect(useAppStore.getState().currentContent).toEqual(loadedCanvas)
    expect(getDocument).toHaveBeenCalledWith(VAULT_A.id, DOCUMENT)
    expect(getCanvas).toHaveBeenCalledWith(VAULT_A.id, CANVAS)
  })

  it('keeps current vault state unchanged when rename returns an error result', async () => {
    const renameVault = vi.fn(async () => ({
      ok: false, error: { code: 'CONFLICT' as const, message: '名称已存在' },
    }))
    window.electronAPI = { knowledge: { renameVault } } as any

    expect(await useAppStore.getState().renameVault(VAULT_A.id, '  新名称  ')).toBe(false)
    expect(renameVault).toHaveBeenCalledWith(VAULT_A.id, '新名称')
    expect(useAppStore.getState().currentVault).toEqual(VAULT_A)
    expect(useAppStore.getState().vaults[0]).toEqual(VAULT_A)
    expect(useAppStore.getState().structureError).toBe('名称已存在')
  })

  it('stops rapid navigation when the current draft cannot be flushed', async () => {
    const loadedDocument: LoadedDocument = {
      ...documentSummary, contentType: 'document', content: { type: 'doc', content: [] },
    }
    useAppStore.setState({ currentContent: loadedDocument })
    const getCanvas = vi.fn()
    window.electronAPI = { knowledge: { getCanvas } } as any
    const unregister = registerPendingSaveFlusher(async () => {
      throw Object.assign(new Error('保存失败，请重试'), { code: 'PERSISTENCE_ERROR' })
    })

    await useAppStore.getState().selectContent(canvasSummary)

    expect(getCanvas).not.toHaveBeenCalled()
    expect(useAppStore.getState().currentContent).toEqual(loadedDocument)
    expect(useAppStore.getState().contentError).toBe('保存失败，请重试')
    expect(useAppStore.getState().structureError).toBeNull()
    unregister()
  })

  it('keeps a failed selection active and retries it successfully', async () => {
    const loadedDocument: LoadedDocument = {
      ...documentSummary, contentType: 'document', content: { type: 'doc', content: [] },
    }
    const getDocument = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'INVALID_DATA', message: '文档节点无效' } })
      .mockResolvedValueOnce({ ok: true, data: loadedDocument })
    window.electronAPI = { knowledge: { getDocument } } as any

    await useAppStore.getState().selectContent(documentSummary)
    expect(useAppStore.getState()).toMatchObject({
      selectedContent: documentSummary,
      currentContent: null,
      contentLoading: false,
      contentError: '文档节点无效',
      structureError: null,
    })

    await useAppStore.getState().selectContent(documentSummary)
    expect(useAppStore.getState()).toMatchObject({
      selectedContent: loadedDocument,
      currentContent: loadedDocument,
      contentLoading: false,
      contentError: null,
    })
    expect(getDocument).toHaveBeenCalledTimes(2)
  })
})
