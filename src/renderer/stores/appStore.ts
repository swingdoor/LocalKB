import { create } from 'zustand'
import type {
  Document,
  DocumentSummary,
  HotkeyConfig,
  StructureError,
  StructureMoveInput,
  Vault,
  VaultStructure,
} from '@shared/types'
import { applyOptimisticMove, getAncestorGroupIds } from '../utils/structureTree'

let vaultLoadGeneration = 0

function expandedStorageKey(vaultId: string): string {
  return `localkb-expanded-groups:${vaultId}`
}

function readExpandedGroups(vaultId: string, structure: VaultStructure): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(expandedStorageKey(vaultId)) || '[]')
    if (!Array.isArray(stored)) return []
    const valid = new Set(
      structure.entries.filter((entry) => entry.kind === 'group').map((entry) => entry.id),
    )
    return stored.filter((id): id is string => typeof id === 'string' && valid.has(id))
  } catch {
    return []
  }
}

function writeExpandedGroups(vaultId: string, ids: string[]): void {
  try {
    localStorage.setItem(expandedStorageKey(vaultId), JSON.stringify(ids))
  } catch {
    // localStorage may be unavailable; expansion still works for the current session.
  }
}

interface AppState {
  vaults: Vault[]
  currentVault: Vault | null
  documents: DocumentSummary[]
  structure: VaultStructure | null
  structureLoading: boolean
  structureError: string | null
  currentDocument: Document | null
  expandedGroupIds: string[]
  revealDocumentId: string | null

  isSearchOpen: boolean
  isSettingsOpen: boolean
  sidebarOpen: boolean
  theme: string
  hotkeys: HotkeyConfig[]
  showHeadingNumbers: boolean

  loadVaults: () => Promise<void>
  createVault: (name: string) => Promise<void>
  renameVault: (vaultId: string, name: string) => Promise<boolean>
  deleteVault: (vaultId: string) => Promise<void>
  switchVault: (vault: Vault) => Promise<void>
  loadDocuments: (vaultId: string) => Promise<void>
  createDocument: (
    title?: string,
    type?: Document['type'],
    parentId?: string | null,
    index?: number,
  ) => Promise<Document | null>
  selectDocument: (doc: Pick<Document, 'id'> | null) => Promise<void>
  deleteDocument: (docId: string) => Promise<void>
  renameDocument: (docId: string, title: string) => Promise<boolean>
  updateDocument: (data: Partial<Pick<Document, 'title' | 'content'>>) => Promise<void>
  createGroup: (parentId?: string | null, name?: string, index?: number) => Promise<string | null>
  renameGroup: (groupId: string, name: string) => Promise<boolean>
  moveStructure: (input: StructureMoveInput) => Promise<boolean>
  deleteGroup: (groupId: string) => Promise<StructureError | null>
  setGroupExpanded: (groupId: string, open: boolean) => void
  revealDocument: (documentId: string) => void
  clearRevealDocument: () => void
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  toggleSidebar: () => void
  loadTheme: () => Promise<void>
  setTheme: (theme: string) => Promise<void>
  loadHotkeys: () => Promise<void>
  updateHotkeys: (hotkeys: HotkeyConfig[]) => void
  toggleHeadingNumbers: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  vaults: [],
  currentVault: null,
  documents: [],
  structure: null,
  structureLoading: false,
  structureError: null,
  currentDocument: null,
  expandedGroupIds: [],
  revealDocumentId: null,
  isSearchOpen: false,
  isSettingsOpen: false,
  sidebarOpen: true,
  theme: 'white',
  hotkeys: [],
  showHeadingNumbers: (() => {
    try {
      const stored = localStorage.getItem('show-heading-numbers')
      return stored ? JSON.parse(stored) : false
    } catch {
      return false
    }
  })(),

  loadVaults: async () => {
    const vaults = await window.electronAPI.vault.list()
    set({ vaults })
    if (vaults.length > 0 && !get().currentVault) {
      const currentVault = vaults[0]
      set({ currentVault })
      await get().loadDocuments(currentVault.id)
    }
  },

  createVault: async (name) => {
    const vault = await window.electronAPI.vault.create(name)
    set((state) => ({
      vaults: [vault, ...state.vaults],
      currentVault: vault,
      documents: [],
      structure: null,
      currentDocument: null,
      expandedGroupIds: [],
    }))
    await get().loadDocuments(vault.id)
  },

  renameVault: async (vaultId, name) => {
    const nextName = name.trim()
    if (!nextName) return false
    if (get().vaults.find((vault) => vault.id === vaultId)?.name === nextName) return true
    const updated = await window.electronAPI.vault.rename(vaultId, nextName)
    if (!updated) return false
    set((state) => ({
      vaults: state.vaults.map((vault) => vault.id === vaultId ? updated : vault),
      currentVault: state.currentVault?.id === vaultId ? updated : state.currentVault,
    }))
    return true
  },

  deleteVault: async (vaultId) => {
    await window.electronAPI.vault.delete(vaultId)
    vaultLoadGeneration += 1
    const { vaults, currentVault } = get()
    const remaining = vaults.filter((vault) => vault.id !== vaultId)
    set({ vaults: remaining })
    if (currentVault?.id !== vaultId) return
    if (remaining.length > 0) {
      const nextVault = remaining[0]
      set({ currentVault: nextVault, currentDocument: null })
      await get().loadDocuments(nextVault.id)
    } else {
      set({
        currentVault: null,
        documents: [],
        structure: null,
        currentDocument: null,
        expandedGroupIds: [],
      })
    }
  },

  switchVault: async (vault) => {
    vaultLoadGeneration += 1
    set({
      currentVault: vault,
      currentDocument: null,
      documents: [],
      structure: null,
      structureError: null,
      expandedGroupIds: [],
      revealDocumentId: null,
    })
    await get().loadDocuments(vault.id)
  },

  loadDocuments: async (vaultId) => {
    const generation = ++vaultLoadGeneration
    set({ structureLoading: true, structureError: null })
    const [documents, result] = await Promise.all([
      window.electronAPI.document.list(vaultId),
      window.electronAPI.structure.get(vaultId),
    ])
    if (generation !== vaultLoadGeneration || get().currentVault?.id !== vaultId) return
    if (!result.success) {
      set({ documents, structure: null, structureLoading: false, structureError: result.error.message })
      return
    }
    set({
      documents,
      structure: result.data,
      structureLoading: false,
      structureError: null,
      expandedGroupIds: readExpandedGroups(vaultId, result.data),
    })
  },

  createDocument: async (title, type = 'document', parentId = null, index) => {
    const { currentVault } = get()
    if (!currentVault) return null
    const document = await window.electronAPI.document.create(
      currentVault.id,
      title || (type === 'document' ? '新建文档' : '新建画布'),
      type,
      parentId,
      index,
    )
    await get().loadDocuments(currentVault.id)
    if (get().currentVault?.id === currentVault.id) set({ currentDocument: document })
    return document
  },

  selectDocument: async (document) => {
    if (!document) {
      set({ currentDocument: null })
      return
    }
    const vaultId = get().currentVault?.id
    if (!vaultId) return
    const fullDocument = await window.electronAPI.document.get(vaultId, document.id)
    if (get().currentVault?.id === vaultId && fullDocument) {
      set({ currentDocument: fullDocument })
    }
  },

  deleteDocument: async (documentId) => {
    const { currentVault, currentDocument } = get()
    if (!currentVault) return
    if (await window.electronAPI.document.delete(currentVault.id, documentId)) {
      await get().loadDocuments(currentVault.id)
      if (currentDocument?.id === documentId) set({ currentDocument: null })
    }
  },

  renameDocument: async (documentId, title) => {
    const { currentVault, currentDocument } = get()
    const nextTitle = title.trim()
    if (!currentVault || !nextTitle) return false
    const updated = await window.electronAPI.document.update(
      currentVault.id,
      documentId,
      { title: nextTitle },
    )
    if (!updated) return false
    const { content: _content, ...summary } = updated
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === documentId ? summary : document),
      currentDocument: currentDocument?.id === documentId ? updated : currentDocument,
    }))
    return true
  },

  updateDocument: async (data) => {
    const { currentVault, currentDocument } = get()
    if (!currentVault || !currentDocument) return
    const updated = await window.electronAPI.document.update(
      currentVault.id,
      currentDocument.id,
      data,
    )
    if (!updated) return
    const { content: _content, ...summary } = updated
    set((state) => ({
      currentDocument: updated,
      documents: state.documents.map((document) =>
        document.id === updated.id ? summary : document),
    }))
  },

  createGroup: async (parentId = null, name = '新建组', index) => {
    const { currentVault, structure } = get()
    if (!currentVault) return null
    const beforeIds = new Set(structure?.entries.map((entry) => entry.id))
    const result = await window.electronAPI.structure.createGroup(
      currentVault.id,
      parentId,
      name,
      index,
    )
    if (!result.success) {
      set({ structureError: result.error.message })
      return null
    }
    const created = result.data.entries.find(
      (entry) => entry.kind === 'group' && !beforeIds.has(entry.id),
    )
    set({ structure: result.data, structureError: null })
    return created?.id ?? null
  },

  renameGroup: async (groupId, name) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return false
    const result = await window.electronAPI.structure.renameGroup(vaultId, groupId, name)
    if (!result.success) {
      set({ structureError: result.error.message })
      return false
    }
    set({ structure: result.data, structureError: null })
    return true
  },

  moveStructure: async (input) => {
    const { currentVault, structure } = get()
    if (!currentVault || !structure) return false
    const previous = structure
    set({ structure: applyOptimisticMove(structure, input), structureError: null })
    const result = await window.electronAPI.structure.move(currentVault.id, input)
    if (get().currentVault?.id !== currentVault.id) return false
    if (!result.success) {
      set({ structure: previous, structureError: result.error.message })
      return false
    }
    set({ structure: result.data })
    return true
  },

  deleteGroup: async (groupId) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return { code: 'ITEM_NOT_FOUND', message: '请先选择知识库' }
    const result = await window.electronAPI.structure.deleteGroup(vaultId, groupId)
    if (!result.success) {
      set({ structureError: result.error.message })
      return result.error
    }
    const validGroups = new Set(
      result.data.entries.filter((entry) => entry.kind === 'group').map((entry) => entry.id),
    )
    const expandedGroupIds = get().expandedGroupIds.filter((id) => validGroups.has(id))
    writeExpandedGroups(vaultId, expandedGroupIds)
    set({ structure: result.data, expandedGroupIds, structureError: null })
    return null
  },

  setGroupExpanded: (groupId, open) => {
    const vaultId = get().currentVault?.id
    if (!vaultId) return
    const next = new Set(get().expandedGroupIds)
    if (open) next.add(groupId)
    else next.delete(groupId)
    const expandedGroupIds = [...next]
    writeExpandedGroups(vaultId, expandedGroupIds)
    set({ expandedGroupIds })
  },

  revealDocument: (documentId) => {
    const { currentVault, structure, expandedGroupIds } = get()
    if (!currentVault) return
    const expanded = new Set(expandedGroupIds)
    for (const id of getAncestorGroupIds(structure, documentId)) expanded.add(id)
    const next = [...expanded]
    writeExpandedGroups(currentVault.id, next)
    set({ expandedGroupIds: next, revealDocumentId: documentId })
  },

  clearRevealDocument: () => set({ revealDocumentId: null }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  loadTheme: async () => {
    const theme = await window.electronAPI.settings.getTheme()
    set({ theme })
    document.documentElement.setAttribute('data-theme', theme === 'white' ? '' : theme)
  },

  setTheme: async (theme) => {
    set({ theme })
    await window.electronAPI.settings.saveTheme(theme)
    document.documentElement.setAttribute('data-theme', theme === 'white' ? '' : theme)
    if (process.platform !== 'darwin') window.electronAPI.theme.changed(theme)
  },

  loadHotkeys: async () => set({ hotkeys: await window.electronAPI.settings.getHotkeys() }),
  updateHotkeys: (hotkeys) => set({ hotkeys }),
  toggleHeadingNumbers: () => {
    set((state) => {
      const showHeadingNumbers = !state.showHeadingNumbers
      try {
        localStorage.setItem('show-heading-numbers', JSON.stringify(showHeadingNumbers))
      } catch {
        // ignore
      }
      return { showHeadingNumbers }
    })
  },
}))
