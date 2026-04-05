/**
 * IPC 通道常量
 * 统一管理 main 和 renderer 进程间通信的通道名
 */

export const IPC_CHANNELS = {
  VAULT: {
    LIST: 'vault:list',
    CREATE: 'vault:create',
    DELETE: 'vault:delete',
    RENAME: 'vault:rename',
  },
  DOCUMENT: {
    LIST: 'document:list',
    GET: 'document:get',
    CREATE: 'document:create',
    UPDATE: 'document:update',
    DELETE: 'document:delete',
    SEARCH: 'document:search',
  },
  FILE: {
    SELECT_IMAGE: 'file:selectImage',
    SAVE_IMAGE: 'file:saveImage',
    READ_IMAGE: 'file:readImage',
    DOWNLOAD_IMAGE: 'file:downloadImage',
    EXPORT_PDF: 'file:exportPDF',
    OPEN_LOCAL_FILE: 'file:openLocalFile',
  },
  SETTINGS: {
    GET_AI: 'settings:getAI',
    SAVE_AI: 'settings:saveAI',
    GET_THEME: 'settings:getTheme',
    SAVE_THEME: 'settings:saveTheme',
  },
  AI: {
    POLISH: 'ai:polish',
    EXPAND: 'ai:expand',
  },
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    IS_MAXIMIZED: 'window:isMaximized',
    MAXIMIZED_CHANGE: 'window:maximized',
  },
  APP: {
    GET_ASSET_PATH: 'app:getAssetPath',
  },
} as const

/**
 * 导出通道类型，便于类型推断
 */
export type IpcChannels = typeof IPC_CHANNELS
