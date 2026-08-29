import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { settingsStore } from './settings-store'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AISettings,
  AttachmentFile,
  HotkeyConfig,
  PolishResult,
} from '../shared/types'

let mainWindowRef: BrowserWindow | null = null
let ipcHandlersRegistered = false
const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024

const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.7z': 'application/x-7z-compressed',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
}

function attachmentMimeType(filePath: string): string {
  return ATTACHMENT_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function getMainWindow(): BrowserWindow | undefined {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    return undefined
  }
  return mainWindowRef
}

/**
 * 通用 AI 调用函数
 * 消除 polish 和 expand 的重复代码
 */
async function callAI(text: string, mode: 'polish' | 'expand'): Promise<PolishResult> {
  const settings = settingsStore.getAISettings()
  
  if (!settings.apiKey) {
    return { success: false, error: '请先配置 API Key' }
  }

  const prompt = mode === 'polish' ? settings.polishPrompt : settings.expandPrompt
  const errorMsg = mode === 'polish' ? '润色失败，请检查网络和配置' : '扩写失败，请检查网络和配置'

  try {
    const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: 'user',
            content: prompt + text,
          },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any
      throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`)
    }

    const data = await response.json() as any
    const resultText = data.choices?.[0]?.message?.content

    if (!resultText) {
      throw new Error('AI 返回结果为空')
    }

    return { success: true, text: resultText.trim() }
  } catch (error: any) {
    console.error(`AI ${mode} error:`, error)
    return { success: false, error: error.message || errorMsg }
  }
}

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow

  if (ipcHandlersRegistered) {
    return
  }
  ipcHandlersRegistered = true

  // ========== 文件操作 ==========
  ipcMain.handle(IPC_CHANNELS.FILE.SELECT_IMAGE, async () => {
    const options = {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
      ]
    } satisfies Electron.OpenDialogOptions
    const owner = getMainWindow()
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)

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

  ipcMain.handle(IPC_CHANNELS.FILE.SELECT_ATTACHMENT, async (): Promise<AttachmentFile | null> => {
    const options = { properties: ['openFile'] } satisfies Electron.OpenDialogOptions
    const owner = getMainWindow()
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) throw new Error('只能选择普通文件作为附件')
    if (stat.size === 0 || stat.size > MAX_ATTACHMENT_BYTES) {
      throw new Error('附件大小必须为 1 字节至 16 MiB')
    }
    const bytes = await fs.promises.readFile(filePath)
    return {
      name: path.basename(filePath),
      mimeType: attachmentMimeType(filePath),
      bytes: new Uint8Array(bytes),
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE.DOWNLOAD_IMAGE, async (_, imageData: string, defaultName: string) => {
    const options = {
      defaultPath: defaultName,
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ]
    } satisfies Electron.SaveDialogOptions
    const owner = getMainWindow()
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)

    if (!result.canceled && result.filePath) {
      const base64Data = imageData.replace(/^data:image\/[^;]+;base64,/, '')
      fs.writeFileSync(result.filePath, base64Data, 'base64')
      return true
    }
    return false
  })

  // ========== PDF 导出 ==========
  ipcMain.handle(IPC_CHANNELS.FILE.EXPORT_PDF, async (_, title: string, htmlContent: string) => {
    const safeTitle = (title || '文档')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    const options = {
      defaultPath: `${title || '文档'}.pdf`,
      filters: [
        { name: 'PDF', extensions: ['pdf'] }
      ]
    } satisfies Electron.SaveDialogOptions
    const owner = getMainWindow()
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options)

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
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f4f4f4; font-weight: 600; }
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
  <h1>${safeTitle}</h1>
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

        try {
          fs.writeFileSync(result.filePath, pdfData)
        } catch (writeErr: any) {
          if (writeErr.code === 'EBUSY' || writeErr.code === 'EPERM') {
            throw new Error('文件正在被其他程序占用，请关闭后重试')
          }
          throw writeErr
        }
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

  // ========== 设置操作 ==========
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_AI, async () => {
    return settingsStore.getAISettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_AI, async (_, settings: Partial<AISettings>) => {
    return settingsStore.saveAISettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_THEME, async () => {
    return settingsStore.getTheme()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_THEME, async (_, theme: string) => {
    return settingsStore.saveTheme(theme)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_HOTKEYS, async () => {
    return settingsStore.getHotkeys()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_HOTKEYS, async (_, hotkeys: HotkeyConfig[]) => {
    return settingsStore.saveHotkeys(hotkeys)
  })

  // ========== AI 润色与扩写 ==========
  ipcMain.handle(IPC_CHANNELS.AI.POLISH, async (_, text: string) => callAI(text, 'polish'))

  ipcMain.handle(IPC_CHANNELS.AI.EXPAND, async (_, text: string) => callAI(text, 'expand'))
}
