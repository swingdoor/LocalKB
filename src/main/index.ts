import { app, BrowserWindow, dialog, ipcMain, shell, protocol, net } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'
import { setupIpcHandlers } from './ipc'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { FileKnowledgeStore } from './knowledge/file-knowledge-store'
import { KnowledgeError, KnowledgeService } from './knowledge/knowledge-service'
import { registerKnowledgeIpc } from './knowledge/knowledge-ipc'
import { handleKnowledgeResourceRequest } from './knowledge/knowledge-resource-protocol'
import { migrateLegacyVaultsAtStartup } from './knowledge/startup-migration'
import { McpHttpService } from './mcp/http-service'
import { McpManager } from './mcp/manager'
import { SettingsStoreError, settingsStore } from './settings-store'
import { getWindowAppearance } from './window-appearance'

let mainWindow: BrowserWindow | null = null
let knowledgeService: KnowledgeService | null = null
let mcpManager: McpManager | null = null
let closeApproved = false
let quitAfterClose = false
let mcpShutdownStarted = false

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const isMac = process.platform === 'darwin'

// 注册自定义协议（用于本地加载 Excalidraw 字体）
protocol.registerSchemesAsPrivileged([{
  scheme: 'excalidraw-fonts',
  privileges: { standard: true, supportFetchAPI: true, bypassCSP: true }
}, {
  scheme: 'localkb-resource',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}])

// Excalidraw 字体路径
function getExcalidrawAssetPath(): string {
  if (isDev) {
    return '' // 开发模式使用默认 CDN
  }
  // 打包后使用自定义协议加载本地字体
  return 'excalidraw-fonts://fonts/'
}

// 注册全局 IPC（只注册一次，不随窗口重建重复注册）
ipcMain.handle(IPC_CHANNELS.APP.GET_ASSET_PATH, () => {
  return getExcalidrawAssetPath()
})

ipcMain.handle(IPC_CHANNELS.FILE.OPEN_LOCAL_FILE, async (_event, filePath: string) => {
  const error = await shell.openPath(filePath)
  if (error) {
    return { success: false, error }
  }
  return { success: true }
})

ipcMain.on(IPC_CHANNELS.WINDOW.MINIMIZE, () => {
  mainWindow?.minimize()
})

ipcMain.on(IPC_CHANNELS.WINDOW.MAXIMIZE, () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE, () => {
  mainWindow?.close()
})

ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE_READY, () => {
  closeApproved = true
  mainWindow?.close()
})

ipcMain.handle(IPC_CHANNELS.WINDOW.IS_MAXIMIZED, () => {
  return mainWindow?.isMaximized()
})

function createWindow() {
  closeApproved = false
  const applicationTheme = settingsStore.getGeneralSettings().applicationTheme
  const appearance = getWindowAppearance(applicationTheme)
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    ...(isMac ? {
      trafficLightPosition: { x: 14, y: 10 }
    } : {
      titleBarOverlay: appearance.titleBarOverlay
    }),
    backgroundColor: appearance.backgroundColor,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  // 设置 IPC 处理器
  if (!knowledgeService) throw new Error('Knowledge service 尚未初始化')
  setupIpcHandlers(mainWindow, knowledgeService)

  // 加载应用
  if (isDev) {
    mainWindow.webContents.on('console-message', (details) => {
      if (details.level === 'error') {
        console.error(`[renderer error] ${details.message} (${details.sourceId}:${details.lineNumber})`)
      }
    })
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[renderer process gone]', details)
    })
    mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error('[preload error]', { preloadPath, error })
    })
    mainWindow.loadURL(`http://localhost:5180/?theme=${applicationTheme}`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'), {
      query: { theme: applicationTheme },
    })
  }

  // 监听窗口状态变化
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, false)
  })

  mainWindow.on('close', (event) => {
    if (closeApproved) return
    event.preventDefault()
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW.CLOSE_REQUESTED)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (quitAfterClose) app.quit()
  })

  // 在默认浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  await settingsStore.initialize()
  const storage = new FileKnowledgeStore(path.join(app.getPath('userData'), 'data'))
  await storage.ensureLayout()
  await migrateLegacyVaultsAtStartup(storage, ({ vaultId, backupPath }) => {
    console.info('Knowledge vault migrated', { vaultId, backupPath })
  })
  knowledgeService = new KnowledgeService(storage, (entry) => {
    console.error('Knowledge operation failed', entry)
  })
  registerKnowledgeIpc(knowledgeService, ipcMain, () => mainWindow?.webContents, {
    open: async ({ vaultId, assetId }) => {
      const assetPath = await knowledgeService!.getAssetPath(vaultId, assetId)
      const error = await shell.openPath(assetPath)
      if (error) throw new KnowledgeError('PERSISTENCE_ERROR', `无法打开附件：${error}`)
    },
    saveAs: async ({ vaultId, assetId, fileName }) => {
      const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
      const result = owner
        ? await dialog.showSaveDialog(owner, { defaultPath: fileName })
        : await dialog.showSaveDialog({ defaultPath: fileName })
      if (result.canceled || !result.filePath) return false
      const asset = await knowledgeService!.readAsset(vaultId, assetId)
      await fs.writeFile(result.filePath, asset.bytes)
      return true
    },
  })
  mcpManager = new McpManager(new McpHttpService(
    knowledgeService,
    app.getVersion(),
    (message) => console.error('MCP service error', { message }),
  ))
  mcpManager.registerIpc(ipcMain)
  await mcpManager.start().catch((error) => {
    console.error('MCP service failed to start', { message: error instanceof Error ? error.message : 'unknown' })
  })

  protocol.handle('localkb-resource', async (request) => {
    if (!knowledgeService) return new Response(null, { status: 503 })
    return handleKnowledgeResourceRequest(knowledgeService, request.url)
  })

  // 注册自定义协议处理器：将 excalidraw-fonts:// 请求映射到本地 resources 目录
  if (!isDev) {
    protocol.handle('excalidraw-fonts', (request) => {
      // excalidraw-fonts://fonts/Excalifont/xxx.woff2 -> resources/fonts/Excalifont/xxx.woff2
      const url = new URL(request.url)
      const filePath = path.join(process.resourcesPath, decodeURIComponent(url.pathname))
      return net.fetch('file://' + filePath)
    })
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch((error) => {
  const message = error instanceof SettingsStoreError
    ? error.message
    : error instanceof Error ? error.message : '应用初始化失败'
  console.error('Application initialization failed', {
    code: error instanceof SettingsStoreError ? error.code : 'STARTUP_ERROR',
    name: error instanceof Error ? error.name : 'UnknownError',
  })
  dialog.showErrorBox('极简笔记无法启动', message)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  quitAfterClose = true
  if (mainWindow && !closeApproved) {
    event.preventDefault()
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW.CLOSE_REQUESTED)
    return
  }
  if (mcpManager && !mcpShutdownStarted) {
    event.preventDefault()
    mcpShutdownStarted = true
    void mcpManager.stop().finally(() => app.quit())
  }
})
