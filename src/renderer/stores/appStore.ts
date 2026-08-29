import { create } from 'zustand'
import type { HotkeyConfig } from '@shared/types'
import type {
  ContentSummary, ContentType, ExcalidrawScene, KnowledgeErrorData,
  LoadedCanvas, LoadedContent, LoadedDocument, Result, TipTapDocument,
  VaultTreeV2, VaultV2,
} from '@shared/knowledge-types'
import { applyOptimisticMove, getAncestorGroupIds } from '../utils/structureTree'
import { flushPendingSaves } from '../utils/pendingSaveCoordinator'

let vaultLoadGeneration = 0

export interface TreeMoveInput {
  id: string
  targetParentId: string | null
  index: number
}

const expandedStorageKey = (vaultId: string) => `localkb-expanded-groups:${vaultId}`

function readExpandedGroups(vaultId: string, structure: VaultTreeV2): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(expandedStorageKey(vaultId)) || '[]')
    if (!Array.isArray(stored)) return []
    const valid = new Set(structure.entries.filter((entry) => entry.kind === 'group').map((entry) => entry.id))
    return stored.filter((id): id is string => typeof id === 'string' && valid.has(id))
  } catch {
    return []
  }
}

function writeExpandedGroups(vaultId: string, ids: string[]): void {
  try { localStorage.setItem(expandedStorageKey(vaultId), JSON.stringify(ids)) } catch { /* session only */ }
}

function resultData<T>(result: Result<T>): T {
  if (result.ok) return result.data
  throw Object.assign(new Error(result.error.message), result.error)
}

function resultError(error: unknown): KnowledgeErrorData {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return {
      code: String(error.code) as KnowledgeErrorData['code'],
      message: String(error.message),
    }
  }
  return { code: 'PERSISTENCE_ERROR', message: '知识库操作失败' }
}

interface AppState {
  vaults: VaultV2[]
  currentVault: VaultV2 | null
  contents: ContentSummary[]
  structure: VaultTreeV2 | null
  structureLoading: boolean
  structureError: string | null
  selectedContent: Pick<ContentSummary, 'id' | 'contentType' | 'title'> | null
  contentLoading: boolean
  contentError: string | null
  currentContent: LoadedContent | null
  expandedGroupIds: string[]
  revealContentId: string | null
  isSearchOpen: boolean
  isSettingsOpen: boolean
  sidebarOpen: boolean
  hotkeys: HotkeyConfig[]
  showHeadingNumbers: boolean
  loadVaults: () => Promise<void>
  createVault: (name: string) => Promise<void>
  renameVault: (vaultId: string, name: string) => Promise<boolean>
  deleteVault: (vaultId: string) => Promise<void>
  switchVault: (vault: VaultV2) => Promise<void>
  loadContents: (vaultId: string) => Promise<void>
  createContent: (title?: string, contentType?: ContentType, parentId?: string | null, index?: number) => Promise<LoadedContent | null>
  selectContent: (content: Pick<ContentSummary, 'id' | 'contentType' | 'title'> | null) => Promise<void>
  deleteContent: (contentId: string) => Promise<void>
  renameContent: (contentId: string, title: string) => Promise<boolean>
  replaceDocument: (content: TipTapDocument) => Promise<LoadedDocument | null>
  updateDocument: (patch: { title?: string; content?: TipTapDocument }) => Promise<LoadedDocument>
  replaceCanvas: (content: ExcalidrawScene) => Promise<LoadedCanvas | null>
  createGroup: (parentId?: string | null, name?: string, index?: number) => Promise<string | null>
  renameGroup: (groupId: string, name: string) => Promise<boolean>
  moveStructure: (input: TreeMoveInput) => Promise<boolean>
  deleteGroup: (groupId: string) => Promise<KnowledgeErrorData | null>
  setGroupExpanded: (groupId: string, open: boolean) => void
  revealContent: (contentId: string) => void
  clearRevealContent: () => void
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  toggleSidebar: () => void
  loadHotkeys: () => Promise<void>
  updateHotkeys: (hotkeys: HotkeyConfig[]) => void
  toggleHeadingNumbers: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  vaults: [], currentVault: null, contents: [], structure: null,
  structureLoading: false, structureError: null,
  selectedContent: null, contentLoading: false, contentError: null, currentContent: null,
  expandedGroupIds: [], revealContentId: null, isSearchOpen: false,
  isSettingsOpen: false, sidebarOpen: true, hotkeys: [],
  showHeadingNumbers: (() => {
    try { return JSON.parse(localStorage.getItem('show-heading-numbers') || 'false') } catch { return false }
  })(),

  loadVaults: async () => {
    try {
      const vaults = resultData(await window.electronAPI.knowledge.listVaults())
      set({ vaults, structureError: null })
      if (vaults.length && !get().currentVault) {
        set({ currentVault: vaults[0] })
        await get().loadContents(vaults[0].id)
      }
    } catch (error) { set({ structureError: resultError(error).message }) }
  },

  createVault: async (name) => {
    try {
      const vault = resultData(await window.electronAPI.knowledge.createVault(name))
      set((state) => ({
        vaults: [vault, ...state.vaults], currentVault: vault, contents: [],
        structure: null, selectedContent: null, currentContent: null,
        contentLoading: false, contentError: null,
        expandedGroupIds: [], structureError: null,
      }))
      await get().loadContents(vault.id)
    } catch (error) { set({ structureError: resultError(error).message }) }
  },

  renameVault: async (vaultId, name) => {
    const nextName = name.trim()
    if (!nextName) return false
    if (get().vaults.find((vault) => vault.id === vaultId)?.name === nextName) return true
    try {
      const updated = resultData(await window.electronAPI.knowledge.renameVault(vaultId, nextName))
      set((state) => ({
        vaults: state.vaults.map((vault) => vault.id === vaultId ? updated : vault),
        currentVault: state.currentVault?.id === vaultId ? updated : state.currentVault,
        structureError: null,
      }))
      return true
    } catch (error) { set({ structureError: resultError(error).message }); return false }
  },

  deleteVault: async (vaultId) => {
    if (get().currentVault?.id === vaultId) {
      try { await flushPendingSaves() } catch (error) {
        set({ structureError: resultError(error).message }); return
      }
    }
    const result = await window.electronAPI.knowledge.deleteVault(vaultId)
    if (!result.ok) { set({ structureError: result.error.message }); return }
    vaultLoadGeneration += 1
    const { vaults, currentVault } = get()
    const remaining = vaults.filter((vault) => vault.id !== vaultId)
    set({ vaults: remaining })
    if (currentVault?.id !== vaultId) return
    if (remaining.length) {
      set({
        currentVault: remaining[0], selectedContent: null, currentContent: null,
        contentLoading: false, contentError: null,
      })
      await get().loadContents(remaining[0].id)
    } else {
      set({
        currentVault: null, contents: [], structure: null,
        selectedContent: null, currentContent: null, contentLoading: false, contentError: null,
        expandedGroupIds: [],
      })
    }
  },

  switchVault: async (vault) => {
    try { await flushPendingSaves() } catch (error) {
      set({ structureError: resultError(error).message }); return
    }
    vaultLoadGeneration += 1
    set({
      currentVault: vault, currentContent: null, contents: [], structure: null,
      selectedContent: null, contentLoading: false, contentError: null,
      structureError: null, expandedGroupIds: [], revealContentId: null,
    })
    await get().loadContents(vault.id)
  },

  loadContents: async (vaultId) => {
    const generation = ++vaultLoadGeneration
    set({ structureLoading: true, structureError: null })
    const [contents, tree] = await Promise.all([
      window.electronAPI.knowledge.listContent(vaultId),
      window.electronAPI.knowledge.getTree(vaultId),
    ])
    if (generation !== vaultLoadGeneration || get().currentVault?.id !== vaultId) return
    if (!contents.ok) {
      set({ structureLoading: false, structureError: contents.error.message })
      return
    }
    if (!tree.ok) {
      set({ structureLoading: false, structureError: tree.error.message })
      return
    }
    set({
      contents: contents.data, structure: tree.data, structureLoading: false, structureError: null,
      expandedGroupIds: readExpandedGroups(vaultId, tree.data),
    })
  },

  createContent: async (title, contentType = 'document', parentId = null, index) => {
    const vault = get().currentVault
    if (!vault) return null
    try { await flushPendingSaves() } catch (error) {
      set({ structureError: resultError(error).message }); return null
    }
    const result = await window.electronAPI.knowledge.createContent(
      vault.id, contentType, title || (contentType === 'document' ? '新建文档' : '新建画布'),
      parentId, index,
    )
    if (!result.ok) { set({ structureError: result.error.message }); return null }
    await get().loadContents(vault.id)
    await get().selectContent(result.data)
    return get().currentContent
  },

  selectContent: async (content) => {
    if (content?.id !== get().currentContent?.id) {
      try { await flushPendingSaves() } catch (error) {
        set({ contentError: resultError(error).message }); return
      }
    }
    if (!content) {
      set({
        selectedContent: null, currentContent: null,
        contentLoading: false, contentError: null,
      })
      return
    }
    const vaultId = get().currentVault?.id
    if (!vaultId) return
    set({
      selectedContent: content,
      currentContent: content.id === get().currentContent?.id ? get().currentContent : null,
      contentLoading: true,
      contentError: null,
    })
    const result = content.contentType === 'document'
      ? await window.electronAPI.knowledge.getDocument(vaultId, content.id)
      : await window.electronAPI.knowledge.getCanvas(vaultId, content.id)
    if (get().currentVault?.id !== vaultId || get().selectedContent?.id !== content.id) return
    if (!result.ok) {
      set({ currentContent: null, contentLoading: false, contentError: result.error.message })
      return
    }
    const loaded = result.data as LoadedContent
    set({
      selectedContent: loaded,
      currentContent: loaded,
      contentLoading: false,
      contentError: null,
    })
  },

  deleteContent: async (contentId) => {
    const { currentVault, currentContent, selectedContent } = get()
    if (!currentVault) return
    if (currentContent?.id === contentId) {
      try { await flushPendingSaves() } catch (error) {
        set({ structureError: resultError(error).message }); return
      }
    }
    const result = await window.electronAPI.knowledge.deleteContent(currentVault.id, contentId)
    if (!result.ok) { set({ structureError: result.error.message }); return }
    await get().loadContents(currentVault.id)
    if (selectedContent?.id === contentId) {
      set({
        selectedContent: null, currentContent: null,
        contentLoading: false, contentError: null,
      })
    }
  },

  renameContent: async (contentId, title) => {
    const { currentVault, currentContent } = get()
    if (!currentVault || !title.trim()) return false
    const result = await window.electronAPI.knowledge.renameContent(currentVault.id, contentId, title.trim())
    if (!result.ok) { set({ structureError: result.error.message }); return false }
    set((state) => ({
      contents: state.contents.map((item) => item.id === contentId ? result.data : item),
      currentContent: currentContent?.id === contentId
        ? { ...currentContent, title: result.data.title, updatedAt: result.data.updatedAt }
        : currentContent,
      selectedContent: state.selectedContent?.id === contentId
        ? { ...state.selectedContent, title: result.data.title }
        : state.selectedContent,
      structureError: null,
    }))
    return true
  },

  replaceDocument: async (content) => {
    const { currentVault, currentContent } = get()
    if (!currentVault || currentContent?.contentType !== 'document') return null
    const result = await window.electronAPI.knowledge.replaceDocument(currentVault.id, currentContent.id, content)
    if (!result.ok) { set({ structureError: result.error.message }); return null }
    set((state) => ({
      currentContent: result.data,
      contents: state.contents.map((item) => item.id === result.data.id
        ? { ...item, updatedAt: result.data.updatedAt } : item),
      structureError: null,
    }))
    return result.data
  },

  updateDocument: async (patch) => {
    const { currentVault, currentContent } = get()
    if (!currentVault || currentContent?.contentType !== 'document') {
      throw new Error('当前未打开文档')
    }
    const result = await window.electronAPI.knowledge.updateDocument(
      currentVault.id, currentContent.id, patch,
    )
    if (!result.ok) {
      set({ structureError: result.error.message })
      throw Object.assign(new Error(result.error.message), result.error)
    }
    set((state) => ({
      currentContent: result.data,
      contents: state.contents.map((item) => item.id === result.data.id ? {
        ...item, title: result.data.title, updatedAt: result.data.updatedAt,
      } : item),
      structureError: null,
    }))
    return result.data
  },

  replaceCanvas: async (content) => {
    const { currentVault, currentContent } = get()
    if (!currentVault || currentContent?.contentType !== 'canvas') return null
    const result = await window.electronAPI.knowledge.replaceCanvas(currentVault.id, currentContent.id, content)
    if (!result.ok) { set({ structureError: result.error.message }); return null }
    const updated: LoadedCanvas = { ...currentContent, content: result.data, updatedAt: new Date().toISOString() }
    set((state) => ({
      currentContent: updated,
      contents: state.contents.map((item) => item.id === updated.id ? { ...item, updatedAt: updated.updatedAt } : item),
      structureError: null,
    }))
    return updated
  },

  createGroup: async (parentId = null, name = '新建组', index) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return null
    const result = await window.electronAPI.knowledge.createGroup(vaultId, parentId, name, index)
    if (!result.ok) { set({ structureError: result.error.message }); return null }
    await get().loadContents(vaultId)
    return result.data.id
  },

  renameGroup: async (groupId, name) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return false
    const result = await window.electronAPI.knowledge.renameGroup(vaultId, groupId, name)
    if (!result.ok) { set({ structureError: result.error.message }); return false }
    set((state) => ({
      structure: state.structure ? {
        ...state.structure,
        entries: state.structure.entries.map((entry) => entry.id === groupId ? result.data : entry),
      } : null,
      structureError: null,
    }))
    return true
  },

  moveStructure: async (input) => {
    const { currentVault, structure } = get()
    if (!currentVault || !structure) return false
    const previous = structure
    set({ structure: applyOptimisticMove(structure, input), structureError: null })
    const result = await window.electronAPI.knowledge.moveTreeEntry(
      currentVault.id, input.id, input.targetParentId, input.index,
    )
    if (get().currentVault?.id !== currentVault.id) return false
    if (!result.ok) { set({ structure: previous, structureError: result.error.message }); return false }
    const tree = await window.electronAPI.knowledge.getTree(currentVault.id)
    if (!tree.ok) { set({ structure: previous, structureError: tree.error.message }); return false }
    set({ structure: tree.data })
    return true
  },

  deleteGroup: async (groupId) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return { code: 'NOT_FOUND', message: '请先选择知识库' }
    const result = await window.electronAPI.knowledge.deleteGroup(vaultId, groupId)
    if (!result.ok) { set({ structureError: result.error.message }); return result.error }
    await get().loadContents(vaultId)
    const valid = new Set(get().structure?.entries.filter((e) => e.kind === 'group').map((e) => e.id))
    const expandedGroupIds = get().expandedGroupIds.filter((id) => valid.has(id))
    writeExpandedGroups(vaultId, expandedGroupIds)
    set({ expandedGroupIds, structureError: null })
    return null
  },

  setGroupExpanded: (groupId, open) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return
    const ids = new Set(get().expandedGroupIds)
    if (open) ids.add(groupId); else ids.delete(groupId)
    const expandedGroupIds = [...ids]
    writeExpandedGroups(vaultId, expandedGroupIds)
    set({ expandedGroupIds })
  },

  revealContent: (contentId) => {
    const { currentVault, structure, expandedGroupIds } = get()
    if (!currentVault) return
    const ids = new Set(expandedGroupIds)
    getAncestorGroupIds(structure, contentId).forEach((id) => ids.add(id))
    const next = [...ids]
    writeExpandedGroups(currentVault.id, next)
    set({ expandedGroupIds: next, revealContentId: contentId })
  },

  clearRevealContent: () => set({ revealContentId: null }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  loadHotkeys: async () => set({ hotkeys: await window.electronAPI.settings.getHotkeys() }),
  updateHotkeys: (hotkeys) => set({ hotkeys }),
  toggleHeadingNumbers: () => set((state) => {
    const showHeadingNumbers = !state.showHeadingNumbers
    try { localStorage.setItem('show-heading-numbers', JSON.stringify(showHeadingNumbers)) } catch { /* ignore */ }
    return { showHeadingNumbers }
  }),
}))
