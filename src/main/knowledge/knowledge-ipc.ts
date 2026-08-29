import type {
  CanvasElementPatch,
  ContentType,
  DocumentNodePatch,
  ExcalidrawElement,
  ExcalidrawScene,
  JsonObject,
  MindMapData,
  MindMapNodeData,
  MindMapNodePatch,
  TipTapDocument,
  TipTapNode,
} from '../../shared/knowledge-types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { assertJsonObject, assertPathSegment, KnowledgeValidationError } from '../../shared/knowledge-validation'
import { KnowledgeService, toResult } from './knowledge-service'

export interface KnowledgeIpcRegistrar {
  handle(channel: string, listener: (event: unknown, request?: unknown) => unknown): void
}

export interface KnowledgeEventTarget {
  send(channel: string, value: unknown): void
}

export interface KnowledgeAssetActions {
  open(input: { vaultId: string; documentId: string; assetId: string; fileName: string }): Promise<void>
  saveAs(input: { vaultId: string; documentId: string; assetId: string; fileName: string }): Promise<boolean>
}

function request<T>(value: unknown): T {
  assertJsonObject(value, 'IPC 请求')
  return value as T
}

function byteArray(value: unknown): Uint8Array {
  if (!Array.isArray(value) || value.some(
    (item) => !Number.isInteger(item) || Number(item) < 0 || Number(item) > 255,
  )) {
    throw new KnowledgeValidationError('INVALID_INPUT', '资源字节数组无效')
  }
  return new Uint8Array(value as number[])
}

export function registerKnowledgeIpc(
  service: KnowledgeService,
  registrar: KnowledgeIpcRegistrar,
  target: () => KnowledgeEventTarget | undefined,
  assetActions?: KnowledgeAssetActions,
): () => void {
  const K = IPC_CHANNELS.KNOWLEDGE
  const handle = <T>(
    channel: string,
    action: (input: T) => Promise<unknown>,
  ) => registrar.handle(channel, (_event, value) => toResult(() => action(request<T>(value))))
  const noInput = (channel: string, action: () => Promise<unknown>) => {
    registrar.handle(channel, () => toResult(action))
  }

  noInput(K.VAULT_LIST, () => service.listVaults())
  handle<{ vaultId: string }>(K.VAULT_GET, (input) => service.getVault(input.vaultId))
  handle<{ name: string }>(K.VAULT_CREATE, (input) => service.createVault(input.name, 'renderer'))
  handle<{ vaultId: string; name: string }>(K.VAULT_RENAME, (input) => (
    service.renameVault(input.vaultId, input.name, 'renderer')
  ))
  handle<{ vaultId: string }>(K.VAULT_DELETE, (input) => (
    service.deleteVault(input.vaultId, 'renderer')
  ))

  handle<{ vaultId: string }>(K.TREE_GET, (input) => service.getTree(input.vaultId))
  handle<{ vaultId: string; parentId: string | null; name: string; index?: number }>(K.GROUP_CREATE, (input) => (
    service.createGroup(input.vaultId, input.parentId, input.name, input.index, 'renderer')
  ))
  handle<{ vaultId: string; groupId: string; name: string }>(K.GROUP_RENAME, (input) => (
    service.renameGroup(input.vaultId, input.groupId, input.name, 'renderer')
  ))
  handle<{ vaultId: string; groupId: string }>(K.GROUP_DELETE, (input) => (
    service.deleteGroup(input.vaultId, input.groupId, 'renderer')
  ))
  handle<{ vaultId: string; entryId: string; parentId: string | null; index: number }>(
    K.TREE_MOVE,
    (input) => service.moveTreeEntry(
      input.vaultId, input.entryId, input.parentId, input.index, 'renderer',
    ),
  )

  handle<{ vaultId: string }>(K.CONTENT_LIST, (input) => service.listContent(input.vaultId))
  handle<{
    vaultId: string
    contentType: ContentType
    title: string
    parentId: string | null
    index?: number
  }>(K.CONTENT_CREATE, (input) => service.createContent(
    input.vaultId, input.contentType, input.title, input.parentId, input.index, 'renderer',
  ))
  handle<{ vaultId: string; contentId: string; title: string }>(K.CONTENT_RENAME, (input) => (
    service.renameContent(input.vaultId, input.contentId, input.title, 'renderer')
  ))
  handle<{ vaultId: string; contentId: string }>(K.CONTENT_DELETE, (input) => (
    service.deleteContent(input.vaultId, input.contentId, 'renderer')
  ))

  handle<{ vaultId: string; documentId: string }>(K.DOCUMENT_GET, (input) => (
    service.getDocument(input.vaultId, input.documentId)
  ))
  handle<{ vaultId: string; documentId: string; title?: string; content?: TipTapDocument }>(
    K.DOCUMENT_UPDATE,
    (input) => service.updateDocument(input.vaultId, input.documentId, {
      title: input.title,
      content: input.content,
    }, 'renderer'),
  )
  handle<{ vaultId: string; documentId: string; content: TipTapDocument }>(
    K.DOCUMENT_REPLACE,
    (input) => service.replaceDocument(input.vaultId, input.documentId, input.content, 'renderer'),
  )
  handle<{
    vaultId: string
    documentId: string
    parentNodeId: string | null
    index?: number
    nodes: TipTapNode[]
  }>(K.DOCUMENT_NODES_INSERT, (input) => service.insertDocumentNodes(
    input.vaultId, input.documentId, input.parentNodeId, input.index, input.nodes, 'renderer',
  ))
  handle<{
    vaultId: string
    documentId: string
    parentNodeId: string | null
    nodes: TipTapNode[]
  }>(K.DOCUMENT_NODES_APPEND, (input) => service.appendDocumentNodes(
    input.vaultId, input.documentId, input.parentNodeId, input.nodes, 'renderer',
  ))
  handle<{ vaultId: string; documentId: string; nodeId: string; node: TipTapNode }>(
    K.DOCUMENT_NODE_REPLACE,
    (input) => service.replaceDocumentNode(
      input.vaultId, input.documentId, input.nodeId, input.node, 'renderer',
    ),
  )
  handle<{ vaultId: string; documentId: string; nodeId: string; patch: DocumentNodePatch }>(
    K.DOCUMENT_NODE_PATCH,
    (input) => service.patchDocumentNode(
      input.vaultId, input.documentId, input.nodeId, input.patch, 'renderer',
    ),
  )
  handle<{
    vaultId: string
    documentId: string
    nodeId: string
    from: number
    to: number
    replacement: string
  }>(K.DOCUMENT_TEXT_REPLACE, (input) => service.replaceDocumentText(
    input.vaultId, input.documentId, input.nodeId,
    input.from, input.to, input.replacement, 'renderer',
  ))
  handle<{ vaultId: string; documentId: string; nodeIds: string[] }>(
    K.DOCUMENT_NODES_DELETE,
    (input) => service.deleteDocumentNodes(
      input.vaultId, input.documentId, input.nodeIds, 'renderer',
    ),
  )

  handle<{ vaultId: string; canvasId: string; documentId?: string }>(K.CANVAS_GET, (input) => (
    service.getCanvas(input.vaultId, input.canvasId, input.documentId)
  ))
  handle<{ vaultId: string; documentId: string; content: ExcalidrawScene }>(
    K.CANVAS_EMBEDDED_CREATE,
    (input) => service.createEmbeddedCanvas(
      input.vaultId, input.documentId, input.content, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; content: ExcalidrawScene }>(
    K.CANVAS_REPLACE,
    (input) => service.replaceCanvas(
      input.vaultId, input.canvasId, input.content, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; elements: ExcalidrawElement[] }>(
    K.CANVAS_ELEMENTS_UPSERT,
    (input) => service.upsertCanvasElements(
      input.vaultId, input.canvasId, input.elements, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; patches: CanvasElementPatch[] }>(
    K.CANVAS_ELEMENTS_PATCH,
    (input) => service.patchCanvasElements(
      input.vaultId, input.canvasId, input.patches, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; elementIds: string[] }>(
    K.CANVAS_ELEMENTS_DELETE,
    (input) => service.deleteCanvasElements(
      input.vaultId, input.canvasId, input.elementIds, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; orderedIds: string[] }>(
    K.CANVAS_ELEMENTS_REORDER,
    (input) => service.reorderCanvasElements(
      input.vaultId, input.canvasId, input.orderedIds, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; files: Record<string, JsonObject> }>(
    K.CANVAS_FILES_UPSERT,
    (input) => service.upsertCanvasFiles(
      input.vaultId, input.canvasId, input.files, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; canvasId: string; documentId?: string; fileIds: string[] }>(
    K.CANVAS_FILES_DELETE,
    (input) => service.deleteCanvasFiles(
      input.vaultId, input.canvasId, input.fileIds, input.documentId, 'renderer',
    ),
  )
  handle<{ vaultId: string; documentId: string; canvasId: string }>(
    K.CANVAS_EMBEDDED_DELETE,
    (input) => service.deleteEmbeddedCanvas(
      input.vaultId, input.documentId, input.canvasId, 'renderer',
    ),
  )

  handle<{ vaultId: string; documentId: string; mindMapId: string }>(K.MINDMAP_GET, (input) => (
    service.getMindMap(input.vaultId, input.documentId, input.mindMapId)
  ))
  handle<{ vaultId: string; documentId: string; content: MindMapData }>(
    K.MINDMAP_CREATE,
    (input) => service.createMindMap(input.vaultId, input.documentId, input.content, 'renderer'),
  )
  handle<{ vaultId: string; documentId: string; mindMapId: string; content: MindMapData }>(
    K.MINDMAP_REPLACE,
    (input) => service.replaceMindMap(
      input.vaultId, input.documentId, input.mindMapId, input.content, 'renderer',
    ),
  )
  handle<{
    vaultId: string
    documentId: string
    mindMapId: string
    parentId: string
    index?: number
    node: MindMapNodeData
  }>(K.MINDMAP_NODE_INSERT, (input) => service.insertMindMapNode(
    input.vaultId, input.documentId, input.mindMapId,
    input.parentId, input.index, input.node, 'renderer',
  ))
  handle<{ vaultId: string; documentId: string; mindMapId: string; patch: MindMapNodePatch }>(
    K.MINDMAP_NODE_PATCH,
    (input) => service.patchMindMapNode(
      input.vaultId, input.documentId, input.mindMapId, input.patch, 'renderer',
    ),
  )
  handle<{
    vaultId: string
    documentId: string
    mindMapId: string
    nodeId: string
    parentId: string
    index?: number
  }>(K.MINDMAP_NODE_MOVE, (input) => service.moveMindMapNode(
    input.vaultId, input.documentId, input.mindMapId,
    input.nodeId, input.parentId, input.index, 'renderer',
  ))
  handle<{ vaultId: string; documentId: string; mindMapId: string; nodeId: string }>(
    K.MINDMAP_NODE_DELETE,
    (input) => service.deleteMindMapNode(
      input.vaultId, input.documentId, input.mindMapId, input.nodeId, 'renderer',
    ),
  )
  handle<{ vaultId: string; documentId: string; mindMapId: string }>(
    K.MINDMAP_DELETE,
    (input) => service.deleteMindMap(
      input.vaultId, input.documentId, input.mindMapId, 'renderer',
    ),
  )

  handle<{ vaultId: string; documentId: string; mimeType: string; bytes: number[]; fileName?: string }>(
    K.ASSET_IMPORT,
    (input) => service.importAsset(
      input.vaultId, input.documentId, input.mimeType, byteArray(input.bytes), 'renderer', input.fileName,
    ),
  )
  handle<{ vaultId: string; documentId: string; assetId: string }>(K.ASSET_DELETE, (input) => (
    service.deleteAsset(input.vaultId, input.documentId, input.assetId, 'renderer')
  ))
  handle<{ vaultId: string; documentId: string; assetId: string; fileName: string }>(
    K.ASSET_OPEN,
    async (input) => {
      if (!assetActions) throw new KnowledgeValidationError('PERSISTENCE_ERROR', '附件打开服务不可用')
      assertPathSegment(input.fileName, '附件文件名')
      return assetActions.open(input)
    },
  )
  handle<{ vaultId: string; documentId: string; assetId: string; fileName: string }>(
    K.ASSET_SAVE_AS,
    async (input) => {
      if (!assetActions) throw new KnowledgeValidationError('PERSISTENCE_ERROR', '附件另存为服务不可用')
      assertPathSegment(input.fileName, '附件文件名')
      return assetActions.saveAs(input)
    },
  )
  handle<{ vaultId: string; query: string; limit?: number }>(K.SEARCH, (input) => (
    service.search(input.vaultId, input.query, input.limit)
  ))

  return service.subscribe((event) => target()?.send(K.CHANGED, event))
}
