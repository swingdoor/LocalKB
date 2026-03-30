import { ipcMain, dialog, BrowserWindow, app } from 'electron'
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

  // ========== PDF 导出 ==========
  ipcMain.handle('file:exportPDF', async (_, title: string, htmlContent: string) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${title || '文档'}.pdf`,
      filters: [
        { name: 'PDF', extensions: ['pdf'] }
      ]
    })

    if (!result.canceled && result.filePath) {
      // 创建隐藏窗口用于渲染 PDF
      const pdfWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        }
      })

      // 构建完整的 HTML 页面
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 40px;
      line-height: 1.6;
      color: #333;
    }
    h1 { font-size: 28px; margin-bottom: 20px; }
    h2 { font-size: 22px; margin-top: 24px; }
    h3 { font-size: 18px; margin-top: 20px; }
    p { margin: 12px 0; }
    ul, ol { padding-left: 24px; }
    li { margin: 6px 0; }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 16px;
      margin: 16px 0;
      color: #666;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
    }
    pre {
      background: #f4f4f4;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <h1>${title || '无标题'}</h1>
  ${htmlContent}
</body>
</html>`

      // 写入临时文件
      const tempPath = path.join(app.getPath('temp'), `localkb-pdf-${Date.now()}.html`)
      fs.writeFileSync(tempPath, fullHtml, 'utf-8')

      try {
        await pdfWindow.loadFile(tempPath)
        
        // 等待内容加载完成
        await new Promise(resolve => setTimeout(resolve, 500))

        const pdfData = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          margins: {
            top: 0.5,
            bottom: 0.5,
            left: 0.5,
            right: 0.5,
          },
        })

        fs.writeFileSync(result.filePath, pdfData)
        return true
      } finally {
        pdfWindow.close()
        // 清理临时文件
        try {
          fs.unlinkSync(tempPath)
        } catch {}
      }
    }
    return false
  })
}
