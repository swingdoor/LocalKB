import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AIProcessRequest,
  AIProcessResult,
  AISettings,
  AttachmentFile,
  HotkeyConfig,
  ImageFile,
} from '../shared/types'
import type { McpStatus, PublicMcpSettings } from '../shared/mcp-types'
import type {
  CanvasElementPatch,
  ContentSummary,
  ContentType,
  DocumentNodePatch,
  ExcalidrawElement,
  ExcalidrawScene,
  JsonObject,
  KnowledgeChangeEvent,
  LoadedCanvas,
  LoadedDocument,
  MindMapData,
  MindMapNodeData,
  MindMapNodePatch,
  Result,
  SearchHit,
  TipTapDocument,
  TipTapNode,
  TreeEntryV2,
  VaultTreeV2,
  VaultV2,
} from '../shared/knowledge-types'

const invokeKnowledge = <T>(channel: string, request?: JsonObject) => (
  request === undefined
    ? ipcRenderer.invoke(channel)
    : ipcRenderer.invoke(channel, Object.fromEntries(
      Object.entries(request).filter(([, value]) => value !== undefined),
    ))
) as Promise<Result<T>>

// 暴露给渲染进程的 API
const electronAPI = {
  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
    completeClose: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE_READY),
    onCloseRequested: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on(IPC_CHANNELS.WINDOW.CLOSE_REQUESTED, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.WINDOW.CLOSE_REQUESTED, listener) }
    },
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED) as Promise<boolean>,
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.on(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE, (_, isMaximized) => callback(isMaximized))
      return () => {
        ipcRenderer.removeAllListeners(IPC_CHANNELS.WINDOW.MAXIMIZED_CHANGE)
      }
    },
  },

  knowledge: {
    listVaults: () => invokeKnowledge<VaultV2[]>(IPC_CHANNELS.KNOWLEDGE.VAULT_LIST),
    getVault: (vaultId: string) => invokeKnowledge<VaultV2>(
      IPC_CHANNELS.KNOWLEDGE.VAULT_GET, { vaultId },
    ),
    createVault: (name: string) => invokeKnowledge<VaultV2>(
      IPC_CHANNELS.KNOWLEDGE.VAULT_CREATE, { name },
    ),
    renameVault: (vaultId: string, name: string) => invokeKnowledge<VaultV2>(
      IPC_CHANNELS.KNOWLEDGE.VAULT_RENAME, { vaultId, name },
    ),
    deleteVault: (vaultId: string) => invokeKnowledge<void>(
      IPC_CHANNELS.KNOWLEDGE.VAULT_DELETE, { vaultId },
    ),
    getTree: (vaultId: string) => invokeKnowledge<VaultTreeV2>(
      IPC_CHANNELS.KNOWLEDGE.TREE_GET, { vaultId },
    ),
    createGroup: (vaultId: string, parentId: string | null, name: string, index?: number) => (
      invokeKnowledge<TreeEntryV2>(IPC_CHANNELS.KNOWLEDGE.GROUP_CREATE, {
        vaultId, parentId, name, index,
      })
    ),
    renameGroup: (vaultId: string, groupId: string, name: string) => (
      invokeKnowledge<TreeEntryV2>(IPC_CHANNELS.KNOWLEDGE.GROUP_RENAME, {
        vaultId, groupId, name,
      })
    ),
    deleteGroup: (vaultId: string, groupId: string) => invokeKnowledge<void>(
      IPC_CHANNELS.KNOWLEDGE.GROUP_DELETE, { vaultId, groupId },
    ),
    moveTreeEntry: (
      vaultId: string, entryId: string, parentId: string | null, index: number,
    ) => invokeKnowledge<TreeEntryV2>(IPC_CHANNELS.KNOWLEDGE.TREE_MOVE, {
      vaultId, entryId, parentId, index,
    }),
    listContent: (vaultId: string) => invokeKnowledge<ContentSummary[]>(
      IPC_CHANNELS.KNOWLEDGE.CONTENT_LIST, { vaultId },
    ),
    createContent: (
      vaultId: string,
      contentType: ContentType,
      title: string,
      parentId: string | null,
      index?: number,
    ) => invokeKnowledge<ContentSummary>(IPC_CHANNELS.KNOWLEDGE.CONTENT_CREATE, {
      vaultId, contentType, title, parentId, index,
    }),
    renameContent: (vaultId: string, contentId: string, title: string) => (
      invokeKnowledge<ContentSummary>(IPC_CHANNELS.KNOWLEDGE.CONTENT_RENAME, {
        vaultId, contentId, title,
      })
    ),
    deleteContent: (vaultId: string, contentId: string) => invokeKnowledge<void>(
      IPC_CHANNELS.KNOWLEDGE.CONTENT_DELETE, { vaultId, contentId },
    ),
    getDocument: (vaultId: string, documentId: string) => invokeKnowledge<LoadedDocument>(
      IPC_CHANNELS.KNOWLEDGE.DOCUMENT_GET, { vaultId, documentId },
    ),
    updateDocument: (
      vaultId: string,
      documentId: string,
      patch: { title?: string; content?: TipTapDocument },
    ) => invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_UPDATE, {
      vaultId, documentId, title: patch.title, content: patch.content,
    }),
    replaceDocument: (vaultId: string, documentId: string, content: TipTapDocument) => (
      invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_REPLACE, {
        vaultId, documentId, content,
      })
    ),
    insertDocumentNodes: (
      vaultId: string, documentId: string, parentNodeId: string | null,
      index: number | undefined, nodes: TipTapNode[],
    ) => invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_NODES_INSERT, {
      vaultId, documentId, parentNodeId, index, nodes,
    }),
    appendDocumentNodes: (
      vaultId: string, documentId: string, parentNodeId: string | null, nodes: TipTapNode[],
    ) => invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_NODES_APPEND, {
      vaultId, documentId, parentNodeId, nodes,
    }),
    replaceDocumentNode: (
      vaultId: string, documentId: string, nodeId: string, node: TipTapNode,
    ) => invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_NODE_REPLACE, {
      vaultId, documentId, nodeId, node,
    }),
    patchDocumentNode: (
      vaultId: string, documentId: string, nodeId: string, patch: DocumentNodePatch,
    ) => invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_NODE_PATCH, {
      vaultId, documentId, nodeId, patch: patch as unknown as JsonObject,
    }),
    replaceDocumentText: (
      vaultId: string, documentId: string, nodeId: string,
      from: number, to: number, replacement: string,
    ) => invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_TEXT_REPLACE, {
      vaultId, documentId, nodeId, from, to, replacement,
    }),
    deleteDocumentNodes: (vaultId: string, documentId: string, nodeIds: string[]) => (
      invokeKnowledge<LoadedDocument>(IPC_CHANNELS.KNOWLEDGE.DOCUMENT_NODES_DELETE, {
        vaultId, documentId, nodeIds,
      })
    ),
    getCanvas: (vaultId: string, canvasId: string, documentId?: string) => (
      invokeKnowledge<LoadedCanvas | ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_GET, {
        vaultId, canvasId, documentId,
      })
    ),
    createEmbeddedCanvas: (
      vaultId: string, documentId: string, content: ExcalidrawScene,
    ) => invokeKnowledge<{ id: string; content: ExcalidrawScene }>(
      IPC_CHANNELS.KNOWLEDGE.CANVAS_EMBEDDED_CREATE, { vaultId, documentId, content },
    ),
    replaceCanvas: (
      vaultId: string, canvasId: string, content: ExcalidrawScene, documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_REPLACE, {
      vaultId, canvasId, content, documentId,
    }),
    upsertCanvasElements: (
      vaultId: string, canvasId: string, elements: ExcalidrawElement[], documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_ELEMENTS_UPSERT, {
      vaultId, canvasId, elements, documentId,
    }),
    patchCanvasElements: (
      vaultId: string, canvasId: string, patches: CanvasElementPatch[], documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_ELEMENTS_PATCH, {
      vaultId, canvasId, patches: patches as unknown as JsonObject[], documentId,
    }),
    deleteCanvasElements: (
      vaultId: string, canvasId: string, elementIds: string[], documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_ELEMENTS_DELETE, {
      vaultId, canvasId, elementIds, documentId,
    }),
    reorderCanvasElements: (
      vaultId: string, canvasId: string, orderedIds: string[], documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_ELEMENTS_REORDER, {
      vaultId, canvasId, orderedIds, documentId,
    }),
    upsertCanvasFiles: (
      vaultId: string, canvasId: string, files: Record<string, JsonObject>, documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_FILES_UPSERT, {
      vaultId, canvasId, files, documentId,
    }),
    deleteCanvasFiles: (
      vaultId: string, canvasId: string, fileIds: string[], documentId?: string,
    ) => invokeKnowledge<ExcalidrawScene>(IPC_CHANNELS.KNOWLEDGE.CANVAS_FILES_DELETE, {
      vaultId, canvasId, fileIds, documentId,
    }),
    deleteEmbeddedCanvas: (vaultId: string, documentId: string, canvasId: string) => (
      invokeKnowledge<void>(IPC_CHANNELS.KNOWLEDGE.CANVAS_EMBEDDED_DELETE, {
        vaultId, documentId, canvasId,
      })
    ),
    getMindMap: (vaultId: string, documentId: string, mindMapId: string) => (
      invokeKnowledge<MindMapData>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_GET, {
        vaultId, documentId, mindMapId,
      })
    ),
    createMindMap: (vaultId: string, documentId: string, content: MindMapData) => (
      invokeKnowledge<{ id: string; content: MindMapData }>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_CREATE, {
        vaultId, documentId, content,
      })
    ),
    replaceMindMap: (
      vaultId: string, documentId: string, mindMapId: string, content: MindMapData,
    ) => invokeKnowledge<MindMapData>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_REPLACE, {
      vaultId, documentId, mindMapId, content,
    }),
    insertMindMapNode: (
      vaultId: string, documentId: string, mindMapId: string,
      parentId: string, index: number | undefined, node: MindMapNodeData,
    ) => invokeKnowledge<MindMapData>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_NODE_INSERT, {
      vaultId, documentId, mindMapId, parentId, index, node,
    }),
    patchMindMapNode: (
      vaultId: string, documentId: string, mindMapId: string, patch: MindMapNodePatch,
    ) => invokeKnowledge<MindMapData>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_NODE_PATCH, {
      vaultId, documentId, mindMapId, patch: patch as unknown as JsonObject,
    }),
    moveMindMapNode: (
      vaultId: string, documentId: string, mindMapId: string,
      nodeId: string, parentId: string, index?: number,
    ) => invokeKnowledge<MindMapData>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_NODE_MOVE, {
      vaultId, documentId, mindMapId, nodeId, parentId, index,
    }),
    deleteMindMapNode: (
      vaultId: string, documentId: string, mindMapId: string, nodeId: string,
    ) => invokeKnowledge<MindMapData>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_NODE_DELETE, {
      vaultId, documentId, mindMapId, nodeId,
    }),
    deleteMindMap: (vaultId: string, documentId: string, mindMapId: string) => (
      invokeKnowledge<void>(IPC_CHANNELS.KNOWLEDGE.MINDMAP_DELETE, {
        vaultId, documentId, mindMapId,
      })
    ),
    importAsset: (
      vaultId: string, documentId: string, mimeType: string, bytes: Uint8Array, fileName?: string,
    ) => invokeKnowledge<{ id: string; mimeType: string; fileName?: string }>(IPC_CHANNELS.KNOWLEDGE.ASSET_IMPORT, {
      vaultId, documentId, mimeType, bytes: [...bytes], fileName,
    }),
    deleteAsset: (vaultId: string, documentId: string, assetId: string) => (
      invokeKnowledge<void>(IPC_CHANNELS.KNOWLEDGE.ASSET_DELETE, {
        vaultId, documentId, assetId,
      })
    ),
    openAsset: (vaultId: string, documentId: string, assetId: string, fileName: string) => (
      invokeKnowledge<void>(IPC_CHANNELS.KNOWLEDGE.ASSET_OPEN, {
        vaultId, documentId, assetId, fileName,
      })
    ),
    saveAssetAs: (vaultId: string, documentId: string, assetId: string, fileName: string) => (
      invokeKnowledge<boolean>(IPC_CHANNELS.KNOWLEDGE.ASSET_SAVE_AS, {
        vaultId, documentId, assetId, fileName,
      })
    ),
    search: (vaultId: string, query: string, limit?: number) => invokeKnowledge<SearchHit[]>(
      IPC_CHANNELS.KNOWLEDGE.SEARCH, { vaultId, query, limit },
    ),
    onChanged: (callback: (event: KnowledgeChangeEvent) => void) => {
      const listener = (_event: unknown, value: KnowledgeChangeEvent) => callback(value)
      ipcRenderer.on(IPC_CHANNELS.KNOWLEDGE.CHANGED, listener)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.KNOWLEDGE.CHANGED, listener) }
    },
  },

  // 文件操作
  file: {
    selectImage: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.SELECT_IMAGE) as Promise<ImageFile | null>,
    selectAttachment: () => ipcRenderer.invoke(IPC_CHANNELS.FILE.SELECT_ATTACHMENT) as Promise<AttachmentFile | null>,
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
    getHotkeys: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_HOTKEYS) as Promise<HotkeyConfig[]>,
    saveHotkeys: (hotkeys: HotkeyConfig[]) => 
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_HOTKEYS, hotkeys) as Promise<HotkeyConfig[]>,
    getMcp: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_MCP) as Promise<PublicMcpSettings>,
    saveMcp: (enabled: boolean) => (
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SAVE_MCP, enabled) as Promise<PublicMcpSettings>
    ),
    getMcpStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_MCP_STATUS) as Promise<McpStatus>,
    getMcpUrl: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_MCP_URL) as Promise<string>,
    resetMcpToken: () => (
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.RESET_MCP_TOKEN) as Promise<PublicMcpSettings>
    ),
    copyMcpUrl: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.COPY_MCP_URL) as Promise<boolean>,
  },

  // AI 功能
  ai: {
    process: (request: AIProcessRequest) => (
      ipcRenderer.invoke(IPC_CHANNELS.AI.PROCESS, request) as Promise<AIProcessResult>
    ),
    cancel: (requestId: string) => (
      ipcRenderer.invoke(IPC_CHANNELS.AI.CANCEL, requestId) as Promise<boolean>
    ),
  },

  // 应用资源路径
  app: {
    getAssetPath: () => ipcRenderer.invoke(IPC_CHANNELS.APP.GET_ASSET_PATH) as Promise<string>,
    getPlatform: () => process.platform,
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
