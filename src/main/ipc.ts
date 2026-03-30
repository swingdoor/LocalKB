import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { vaultStore, documentStore, imageStore } from './store'

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  // ========== Vault 操作 ==========
  ipcMain.handle('vault:list', async () => {
    return vaultStore.list()
  })

  ipcMain.handle('vault:create', async (_, name: string) => {
    return vaultStore.create(name)
  })

  ipcMain.handle('vault:delete', async (_, vaultId: string) => {
    return vaultStore.delete(vaultId)
  })

  ipcMain.handle('vault:rename', async (_, vaultId: string, newName: string) => {
    return vaultStore.rename(vaultId, newName)
  })

  // ========== Document 操作 ==========
  ipcMain.handle('document:list', async (_, vaultId: string) => {
    return documentStore.list(vaultId)
  })

  ipcMain.handle('document:get', async (_, vaultId: string, docId: string) => {
    return documentStore.get(vaultId, docId)
  })

  ipcMain.handle('document:create', async (_, vaultId: string, title: string, type: 'document' | 'drawing') => {
    return documentStore.create(vaultId, title, type)
  })

  ipcMain.handle('document:update', async (_, vaultId: string, docId: string, data: { title?: string; content?: string }) => {
    return documentStore.update(vaultId, docId, data)
  })

  ipcMain.handle('document:delete', async (_, vaultId: string, docId: string) => {
    return documentStore.delete(vaultId, docId)
  })

  ipcMain.handle('document:search', async (_, vaultId: string, query: string) => {
    return documentStore.search(vaultId, query)
  })

  // ========== 文件操作 ==========
  ipcMain.handle('file:selectImage', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
      ]
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).slice(1)
      return {
        path: filePath,
        name: path.basename(filePath),
        data: `data:image/${ext};base64,${data.toString('base64')}`
      }
    }
    return null
  })

  ipcMain.handle('file:saveImage', async (_, vaultId: string, imageData: string, fileName: string) => {
    return imageStore.save(vaultId, imageData, fileName)
  })

  ipcMain.handle('file:readImage', async (_, imagePath: string) => {
    return imageStore.read(imagePath)
  })

  ipcMain.handle('file:downloadImage', async (_, imageData: string, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ]
    })

    if (!result.canceled && result.filePath) {
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
      fs.writeFileSync(result.filePath, base64Data, 'base64')
      return true
    }
    return false
  })
}
