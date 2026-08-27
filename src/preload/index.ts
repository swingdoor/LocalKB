import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AISettings,
  Document,
  DocumentSummary,
  HotkeyConfig,
  ImageFile,
  PolishResult,
  StructureMoveInput,
  StructureResult,
  Vault,
  VaultStructure,
} from '../shared/types'

// 暴露给渲染进程的 API
const electronAPI = {
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED) as Promise<boolean>,
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.on(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, (_, isMaximized) => callback(isMaximized))
      return () => {
        ipcRenderer.removeAllListeners(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE)
      }
    },
  },

  // Vault 操作
  vault: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.VAULT.LIST) as Promise<Vault[]>,
    create: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.VAULT.CREATE, name) as Promise<Vault>,
    delete: (vaultId: string) => ipcRenderer.invoke(IPC_CHANNELS.VAULT.DELETE, vaultId) as Promise<boolean>,
    rename: (vaultId: string, newName: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.VAULT.RENAME, vaultId, newName) as Promise<Vault | null>,
  },

  // Document 操作
  document: {
    list: (vaultId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT.LIST, vaultId) as Promise<DocumentSummary[]>,
    get: (vaultId: string, docId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT.GET, vaultId, docId) as Promise<Document | null>,
    create: (
      vaultId: string,
      title: string,
      type: 'document' | 'drawing' = 'document',
      parentId: string | null = null,
      index?: number,
    ) => ipcRenderer.invoke(
      IPC_CHANNELS.DOCUMENT.CREATE,
      vaultId,
      title,
      type,
      parentId,
      index,
    ) as Promise<Document>,
    update: (vaultId: string, docId: string, data: { title?: string; content?: string }) => 
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT.UPDATE, vaultId, docId, data) as Promise<Document | null>,
    delete: (vaultId: string, docId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT.DELETE, vaultId, docId) as Promise<boolean>,
    search: (vaultId: string, query: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENT.SEARCH, vaultId, query) as Promise<Document[]>,
  },

  // 文档组织结构操作。所有失败均返回稳定的领域错误，不暴露 ipcRenderer。
  structure: {
    get: (vaultId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.STRUCTURE.GET, vaultId) as Promise<StructureResult<VaultStructure>>,
    createGroup: (vaultId: string, parentId: string | null, name: string, index?: number) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.STRUCTURE.CREATE_GROUP,
        vaultId,
        parentId,
        name,
        index,
      ) as Promise<StructureResult<VaultStructure>>,
    renameGroup: (vaultId: string, groupId: string, name: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.STRUCTURE.RENAME_GROUP,
        vaultId,
        groupId,
        name,
      ) as Promise<StructureResult<VaultStructure>>,
    move: (vaultId: string, input: StructureMoveInput) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.STRUCTURE.MOVE,
        vaultId,
        input,
      ) as Promise<StructureResult<VaultStructure>>,
    deleteGroup: (vaultId: string, groupId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.STRUCTURE.DELETE_GROUP,
        vaultId,
        groupId,
      ) as Promise<StructureResult<VaultStructure>>,
  },

  // 文件操作
  file: {
    selectImage: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.SELECT_IMAGE) as Promise<ImageFile | null>,
    saveImage: (vaultId: string, imageData: string, fileName: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE_IMAGE, vaultId, imageData, fileName) as Promise<string>,
    readImage: (imagePath: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.FILE.READ_IMAGE, imagePath) as Promise<string | null>,
    downloadImage: (imageData: string, defaultName: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.FILE.DOWNLOAD_IMAGE, imageData, defaultName) as Promise<boolean>,
    exportPDF: (title: string, htmlContent: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE.EXPORT_PDF, title, htmlContent) as Promise<boolean>,
    openLocalFile: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN_LOCAL_FILE, filePath) as Promise<{ success: boolean; error?: string }>,
  },

  // 设置操作
  settings: {
    getAI: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_AI) as Promise<AISettings>,
    saveAI: (settings: Partial<AISettings>) => 
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_AI, settings) as Promise<AISettings>,
    getTheme: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_THEME) as Promise<string>,
    saveTheme: (theme: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_THEME, theme) as Promise<string>,
    getDefaults: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_DEFAULTS) as Promise<Record<string, unknown>>,
    saveDefaults: (config: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_DEFAULTS, config) as Promise<Record<string, unknown>>,
    getHotkeys: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_HOTKEYS) as Promise<HotkeyConfig[]>,
    saveHotkeys: (hotkeys: HotkeyConfig[]) => 
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_HOTKEYS, hotkeys) as Promise<HotkeyConfig[]>,
  },

  // AI 功能
  ai: {
    polish: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.POLISH, text) as Promise<PolishResult>,
    expand: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.EXPAND, text) as Promise<PolishResult>,
  },

  // 应用资源路径
  app: {
    getAssetPath: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_ASSET_PATH) as Promise<string>,
    getPlatform: () => process.platform,
  },

  // 主题（用于同步系统按钮颜色）
  theme: {
    changed: (theme: string) => ipcRenderer.invoke(IPC_CHANNELS.THEME.CHANGED, theme),
  },
}

// 暴露 API 到 window 对象
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明
declare global {
  interface Window {
    electronAPI: typeof electronAPI
    EXCALIDRAW_ASSET_PATH?: string
  }
}
