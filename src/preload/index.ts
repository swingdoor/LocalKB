import { contextBridge, ipcRenderer } from 'electron'

// 类型定义
export interface Document {
  id: string
  title: string
  content: string
  type: 'document' | 'drawing'
  createdAt: string
  updatedAt: string
}

export interface Vault {
  id: string
  name: string
  createdAt: string
}

export interface ImageFile {
  path: string
  name: string
  data: string
}

// 暴露给渲染进程的 API
const electronAPI = {
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.on('window:maximized', (_, isMaximized) => callback(isMaximized))
      return () => {
        ipcRenderer.removeAllListeners('window:maximized')
      }
    },
  },

  // Vault 操作
  vault: {
    list: () => ipcRenderer.invoke('vault:list') as Promise<Vault[]>,
    create: (name: string) => ipcRenderer.invoke('vault:create', name) as Promise<Vault>,
    delete: (vaultId: string) => ipcRenderer.invoke('vault:delete', vaultId) as Promise<boolean>,
    rename: (vaultId: string, newName: string) => 
      ipcRenderer.invoke('vault:rename', vaultId, newName) as Promise<Vault | null>,
  },

  // Document 操作
  document: {
    list: (vaultId: string) => 
      ipcRenderer.invoke('document:list', vaultId) as Promise<Document[]>,
    get: (vaultId: string, docId: string) => 
      ipcRenderer.invoke('document:get', vaultId, docId) as Promise<Document | null>,
    create: (vaultId: string, title: string, type: 'document' | 'drawing' = 'document') => 
      ipcRenderer.invoke('document:create', vaultId, title, type) as Promise<Document>,
    update: (vaultId: string, docId: string, data: { title?: string; content?: string }) => 
      ipcRenderer.invoke('document:update', vaultId, docId, data) as Promise<Document | null>,
    delete: (vaultId: string, docId: string) => 
      ipcRenderer.invoke('document:delete', vaultId, docId) as Promise<boolean>,
    search: (vaultId: string, query: string) => 
      ipcRenderer.invoke('document:search', vaultId, query) as Promise<Document[]>,
  },

  // 文件操作
  file: {
    selectImage: () => ipcRenderer.invoke('file:selectImage') as Promise<ImageFile | null>,
    saveImage: (vaultId: string, imageData: string, fileName: string) => 
      ipcRenderer.invoke('file:saveImage', vaultId, imageData, fileName) as Promise<string>,
    readImage: (imagePath: string) => 
      ipcRenderer.invoke('file:readImage', imagePath) as Promise<string | null>,
    downloadImage: (imageData: string, defaultName: string) => 
      ipcRenderer.invoke('file:downloadImage', imageData, defaultName) as Promise<boolean>,
    exportPDF: (title: string, htmlContent: string) =>
      ipcRenderer.invoke('file:exportPDF', title, htmlContent) as Promise<boolean>,
  },
}

// 暴露 API 到 window 对象
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明
declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
