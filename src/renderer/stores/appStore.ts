import { create } from 'zustand'
import type { Document, Vault, HotkeyConfig } from '@shared/types'

interface AppState {
  // 数据状态
  vaults: Vault[]
  currentVault: Vault | null
  documents: Document[]
  currentDocument: Document | null

  // UI 状态
  isSearchOpen: boolean
  isSettingsOpen: boolean
  sidebarOpen: boolean
  theme: string
  hotkeys: HotkeyConfig[]
  showHeadingNumbers: boolean

  // Actions
  loadVaults: () => Promise<void>
  createVault: (name: string) => Promise<void>
  deleteVault: (vaultId: string) => Promise<void>
  switchVault: (vault: Vault) => Promise<void>
  loadDocuments: (vaultId: string) => Promise<void>
  createDocument: (title?: string, type?: 'document' | 'drawing') => Promise<void>
  selectDocument: (doc: Document | null) => Promise<void>
  deleteDocument: (docId: string) => Promise<void>
  updateDocument: (data: Partial<Document>) => Promise<void>
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
  // 初始状态
  vaults: [],
  currentVault: null,
  documents: [],
  currentDocument: null,
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

  // 加载知识库列表
  loadVaults: async () => {
    const vaultList = await window.electronAPI.vault.list()
    set({ vaults: vaultList })
    
    // 如果有知识库且当前没有选中，自动选中第一个
    const { currentVault } = get()
    if (vaultList.length > 0 && !currentVault) {
      const firstVault = vaultList[0]
      set({ currentVault: firstVault })
      // 加载该知识库的文档
      await get().loadDocuments(firstVault.id)
    }
  },

  // 创建知识库
  createVault: async (name: string) => {
    const vault = await window.electronAPI.vault.create(name)
    set((state) => ({ 
      vaults: [vault, ...state.vaults],
      currentVault: vault,
      documents: [],
      currentDocument: null
    }))
  },

  // 删除知识库
  deleteVault: async (vaultId: string) => {
    await window.electronAPI.vault.delete(vaultId)
    
    const { vaults, currentVault } = get()
    const remaining = vaults.filter(v => v.id !== vaultId)
    
    set({ vaults: remaining })
    
    // 如果删除的是当前选中的知识库，切换到其他知识库
    if (currentVault?.id === vaultId) {
      if (remaining.length > 0) {
        set({ currentVault: remaining[0] })
        await get().loadDocuments(remaining[0].id)
      } else {
        set({ currentVault: null, documents: [], currentDocument: null })
      }
    }
  },

  // 切换知识库
  switchVault: async (vault: Vault) => {
    set({ currentVault: vault, currentDocument: null })
    await get().loadDocuments(vault.id)
  },

  // 加载文档列表
  loadDocuments: async (vaultId: string) => {
    const docList = await window.electronAPI.document.list(vaultId)
    set({ documents: docList })
  },

  // 创建文档
  createDocument: async (title?: string, type: 'document' | 'drawing' = 'document') => {
    const { currentVault } = get()
    if (!currentVault) return
    
    const docTitle = title || (type === 'document' ? '新建文档' : '新建画布')
    const doc = await window.electronAPI.document.create(currentVault.id, docTitle, type)
    
    set((state) => ({
      documents: [doc, ...state.documents],
      currentDocument: doc
    }))
  },

  // 选择文档
  selectDocument: async (doc: Document | null) => {
    if (!doc) {
      set({ currentDocument: null })
      return
    }
    
    const { currentVault } = get()
    if (!currentVault) return
    
    // 获取完整文档内容
    const fullDoc = await window.electronAPI.document.get(currentVault.id, doc.id)
    if (fullDoc) {
      set({ currentDocument: fullDoc })
    }
  },

  // 删除文档
  deleteDocument: async (docId: string) => {
    const { currentVault, currentDocument, documents } = get()
    if (!currentVault) return
    
    const success = await window.electronAPI.document.delete(currentVault.id, docId)
    if (success) {
      const remaining = documents.filter(d => d.id !== docId)
      set({ documents: remaining })
      
      // 如果删除的是当前选中的文档，清空选中
      if (currentDocument?.id === docId) {
        set({ currentDocument: null })
      }
    }
  },

  // 更新文档
  updateDocument: async (data: Partial<Document>) => {
    const { currentVault, currentDocument } = get()
    if (!currentVault || !currentDocument) return
    
    const updated = await window.electronAPI.document.update(
      currentVault.id,
      currentDocument.id,
      data
    )
    
    if (updated) {
      set((state) => ({
        currentDocument: updated,
        documents: state.documents.map(d => 
          d.id === updated.id ? { ...d, ...updated } : d
        )
      }))
    }
  },

  // 搜索框开关
  setSearchOpen: (open: boolean) => {
    set({ isSearchOpen: open })
  },

  // 设置框开关
  setSettingsOpen: (open: boolean) => {
    set({ isSettingsOpen: open })
  },

  // 侧边栏开关
  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }))
  },

  // 加载主题
  loadTheme: async () => {
    const savedTheme = await window.electronAPI.settings.getTheme()
    set({ theme: savedTheme })
    document.documentElement.setAttribute('data-theme', savedTheme === 'white' ? '' : savedTheme)
  },

  // 切换主题
  setTheme: async (theme: string) => {
    set({ theme })
    await window.electronAPI.settings.saveTheme(theme)
    document.documentElement.setAttribute('data-theme', theme === 'white' ? '' : theme)
  },

  // 加载快捷键
  loadHotkeys: async () => {
    const hotkeys = await window.electronAPI.settings.getHotkeys()
    set({ hotkeys })
  },

  // 更新快捷键（内存中）
  updateHotkeys: (hotkeys: HotkeyConfig[]) => {
    set({ hotkeys })
  },

  // 切换章节序号显示
  toggleHeadingNumbers: () => {
    set((state) => {
      const next = !state.showHeadingNumbers
      try {
        localStorage.setItem('show-heading-numbers', JSON.stringify(next))
      } catch {
        // ignore
      }
      return { showHeadingNumbers: next }
    })
  },
}))
