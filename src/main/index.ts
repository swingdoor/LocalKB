import { app, BrowserWindow, ipcMain, shell, protocol, net } from 'electron'
import * as path from 'path'
import { setupIpcHandlers } from './ipc'
import { IPC_CHANNELS } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// 注册自定义协议（用于本地加载 Excalidraw 字体）
protocol.registerSchemesAsPrivileged([{
  scheme: 'excalidraw-fonts',
  privileges: { standard: true, supportFetchAPI: true, bypassCSP: true }
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

ipcMain.handle(IPC_CHANNELS.WINDOW.IS_MAXIMIZED, () => {
  return mainWindow?.isMaximized()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  // 设置 IPC 处理器
  setupIpcHandlers(mainWindow)

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5180')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  // 监听窗口状态变化
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, false)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 在默认浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
