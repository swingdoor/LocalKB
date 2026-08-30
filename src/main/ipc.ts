import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { settingsStore } from './settings-store'
import { describeAIError, generateAIText } from './ai-service'
import { MarkdownExportService } from './markdown-export-service'
import { buildPdfHtml, waitForPdfLayout } from './pdf-export'
import type { KnowledgeService } from './knowledge/knowledge-service'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  MarkdownExportBeginRequest,
  MarkdownExportCommitRequest,
} from '../shared/markdown-export-types'
import type { PdfExportResult } from '../shared/pdf-export-types'
import type {
  AIProcessRequest,
  AIProcessResult,
  AISettings,
  AttachmentFile,
  GeneralSettings,
  HotkeyConfig,
} from '../shared/types'

let mainWindowRef: BrowserWindow | null = null
let ipcHandlersRegistered = false
let markdownExportService: MarkdownExportService | null = null
const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024
const PDF_REVEAL_TTL_MS = 30 * 60 * 1000
const activeAIRequests = new Map<string, AbortController>()
const completedPdfExports = new Map<string, { filePath: string; expiresAt: number }>()

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

function rememberPdfExport(filePath: string): string {
  const now = Date.now()
  for (const [id, entry] of completedPdfExports) {
    if (entry.expiresAt <= now) completedPdfExports.delete(id)
  }
  const revealId = randomUUID()
  completedPdfExports.set(revealId, { filePath, expiresAt: now + PDF_REVEAL_TTL_MS })
  return revealId
}

function revealPdfExport(revealId: string): boolean {
  const entry = completedPdfExports.get(revealId)
  if (!entry || entry.expiresAt <= Date.now()) {
    completedPdfExports.delete(revealId)
    return false
  }
  shell.showItemInFolder(entry.filePath)
  return true
}

function aiRequestKey(senderId: number, requestId: string) {
  return `${senderId}:${requestId}`
}

function buildAIInput(settings: AISettings, request: AIProcessRequest): string {
  if (request.mode === 'polish') return settings.polishPrompt + request.text
  if (request.mode === 'expand') return settings.expandPrompt + request.text
  const instruction = request.instruction?.trim()
  if (!instruction) throw new Error('请输入自定义指令')
  return `请严格按照以下临时指令修改所选文字，只返回修改后的文字，不要解释。\n\n临时指令：${instruction}\n\n所选文字：\n${request.text}`
}

async function callAI(
  request: AIProcessRequest,
  key: string,
): Promise<AIProcessResult> {
  if (!request.requestId?.trim()) return { success: false, error: '无效的请求 ID' }
  if (!request.text?.trim()) return { success: false, error: '请选择需要处理的文字' }

  const settings = settingsStore.getAISettings()
  const controller = new AbortController()
  activeAIRequests.get(key)?.abort()
  activeAIRequests.set(key, controller)
  const actionName = request.mode === 'polish' ? '润色' : request.mode === 'expand' ? '扩写' : '自定义处理'

  try {
    const input = buildAIInput(settings, request)
    return { success: true, text: await generateAIText(settings, input, controller.signal) }
  } catch (error: unknown) {
    if (!controller.signal.aborted) console.error(`AI ${request.mode} error:`, error)
    return {
      success: false,
      error: describeAIError(error, `${actionName}失败，请检查网络和配置`),
    }
  } finally {
    if (activeAIRequests.get(key) === controller) activeAIRequests.delete(key)
  }
}

export function setupIpcHandlers(mainWindow: BrowserWindow, knowledgeService: KnowledgeService) {
  mainWindowRef = mainWindow

  if (!markdownExportService) {
    markdownExportService = new MarkdownExportService(knowledgeService, {
      chooseTarget: async (defaultFileName) => {
        const options = {
          defaultPath: defaultFileName,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        } satisfies Electron.SaveDialogOptions
        const owner = getMainWindow()
        const result = owner
          ? await dialog.showSaveDialog(owner, options)
          : await dialog.showSaveDialog(options)
        return result.canceled || !result.filePath ? null : result.filePath
      },
      confirmReplace: async (markdownPath, assetsPath) => {
        const options = {
          type: 'warning',
          buttons: ['取消', '替换整个导出包'],
          defaultId: 0,
          cancelId: 0,
          title: '替换 Markdown 导出包',
          message: '目标文档或同名资源目录已存在',
          detail: `继续将同时替换：\n${path.basename(markdownPath)}\n${path.basename(assetsPath)}`,
        } satisfies Electron.MessageBoxOptions
        const owner = getMainWindow()
        const result = owner
          ? await dialog.showMessageBox(owner, options)
          : await dialog.showMessageBox(options)
        return result.response === 1
      },
      revealTarget: (markdownPath) => shell.showItemInFolder(markdownPath),
    })
  }

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
        { name: 'Images', extensions: ['png', 'svg', 'jpg', 'jpeg', 'gif', 'webp'] }
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
  ipcMain.handle(IPC_CHANNELS.FILE.EXPORT_PDF, async (_, title: string, htmlContent: string): Promise<PdfExportResult> => {
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

    if (result.canceled || !result.filePath) return { canceled: true }

    const pdfWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    const tempPath = path.join(app.getPath('temp'), `localkb-pdf-${randomUUID()}.html`)
    fs.writeFileSync(tempPath, buildPdfHtml(title, htmlContent), 'utf-8')

    try {
      await pdfWindow.loadFile(tempPath)
      await waitForPdfLayout(pdfWindow.webContents)
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
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EBUSY' || code === 'EPERM') {
          throw new Error('文件正在被其他程序占用，请关闭后重试')
        }
        throw error
      }
      return { canceled: false, revealId: rememberPdfExport(result.filePath) }
    } finally {
      if (!pdfWindow.isDestroyed()) pdfWindow.close()
      try {
        fs.unlinkSync(tempPath)
      } catch {}
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.FILE.REVEAL_PDF_EXPORT,
    async (_, revealId: string) => revealPdfExport(revealId),
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE.BEGIN_MARKDOWN_EXPORT,
    async (_, request: MarkdownExportBeginRequest) => markdownExportService!.begin(request),
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE.COMMIT_MARKDOWN_EXPORT,
    async (_, request: MarkdownExportCommitRequest) => markdownExportService!.commit(request),
  )

  ipcMain.handle(
    IPC_CHANNELS.FILE.REVEAL_MARKDOWN_EXPORT,
    async (_, revealId: string) => markdownExportService!.reveal(revealId),
  )

  // ========== 设置操作 ==========
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_GENERAL, async () => {
    return settingsStore.getGeneralSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_GENERAL, async (_, settings: Partial<GeneralSettings>) => {
    return settingsStore.saveGeneralSettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_AI, async () => {
    return settingsStore.getAISettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_AI, async (_, settings: Partial<AISettings>) => {
    return settingsStore.saveAISettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_HOTKEYS, async () => {
    return settingsStore.getHotkeys()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SAVE_HOTKEYS, async (_, hotkeys: HotkeyConfig[]) => {
    return settingsStore.saveHotkeys(hotkeys)
  })

  // ========== AI 文字处理 ==========
  ipcMain.handle(IPC_CHANNELS.AI.PROCESS, async (event, request: AIProcessRequest) => (
    callAI(request, aiRequestKey(event.sender.id, request.requestId))
  ))

  ipcMain.handle(IPC_CHANNELS.AI.CANCEL, async (event, requestId: string) => {
    const controller = activeAIRequests.get(aiRequestKey(event.sender.id, requestId))
    if (!controller) return false
    controller.abort()
    return true
  })
}
