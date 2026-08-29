import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { TIPTAP_NODE_TYPES } from '../../shared/knowledge-types'
import type { JsonObject, JsonValue } from '../../shared/knowledge-types'
import { documentNodeSnapshots } from '../../shared/knowledge-operations'
import { asKnowledgeError, KnowledgeError, KnowledgeService } from '../knowledge/knowledge-service'
import {
  attrsPatchSchema,
  batchIdsSchema,
  excalidrawElementSchema,
  excalidrawElementTypeSchema,
  excalidrawFileSchema,
  excalidrawSceneSchema,
  jsonObjectSchema,
  mindMapDataSchema,
  mindMapNodeSchema,
  nativeBatchIdsSchema,
  nativeIdSchema,
  searchLimitSchema,
  tipTapNodeSchema,
  toolOutputSchema,
  uuidSchema,
} from './schemas'

const MAX_ASSET_BYTES = 16 * 1024 * 1024
const emptyInput = z.strictObject({})
const vaultInput = z.strictObject({ vaultId: uuidSchema })

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: z.ZodType
  readOnly?: boolean
  destructive?: boolean
  run(input: Record<string, unknown>): Promise<JsonValue>
}

function jsonData(value: unknown): JsonValue {
  return value === undefined ? null : value as JsonValue
}

function canonicalBase64(value: string): Uint8Array {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const body = padding ? value.slice(0, -padding) : value
  if (value.length % 4 !== 0 || body.length === 0 || body.includes('=') || /[^A-Za-z0-9+/]/.test(body)) {
    throw new KnowledgeError('INVALID_INPUT', '附件数据不是有效 canonical base64')
  }
  const decodedLength = value.length / 4 * 3 - padding
  if (decodedLength < 1 || decodedLength > MAX_ASSET_BYTES) {
    throw new KnowledgeError('INVALID_INPUT', '附件大小必须为 1 字节至 16 MiB')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.byteLength !== decodedLength) {
    throw new KnowledgeError('INVALID_INPUT', '附件大小必须为 1 字节至 16 MiB')
  }
  return new Uint8Array(bytes)
}

export function createMcpToolDefinitions(service: KnowledgeService): ToolDefinition[] {
  const definitions: ToolDefinition[] = [
    {
      name: 'vault_list', description: '列出本地知识库及其原生元数据。', inputSchema: emptyInput, readOnly: true,
      run: async () => jsonData(await service.listVaults()),
    },
    {
      name: 'vault_create', description: '创建一个空知识库。', inputSchema: z.strictObject({ name: z.string().min(1).max(100) }),
      run: async ({ name }) => jsonData(await service.createVault(String(name), 'mcp')),
    },
    {
      name: 'vault_update', description: '更新知识库名称。', inputSchema: z.strictObject({ vaultId: uuidSchema, name: z.string().min(1).max(100) }),
      run: async ({ vaultId, name }) => jsonData(await service.renameVault(String(vaultId), String(name), 'mcp')),
    },
    {
      name: 'vault_delete', description: '删除整个知识库及其资源。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, confirm: z.literal(true) }),
      run: async ({ vaultId }) => jsonData(await service.deleteVault(String(vaultId), 'mcp')),
    },
    {
      name: 'tree_get', description: '读取知识库原生 VaultTreeV2 扁平树。', inputSchema: vaultInput, readOnly: true,
      run: async ({ vaultId }) => jsonData(await service.getTree(String(vaultId))),
    },
    {
      name: 'tree_insert', description: '在 VaultTreeV2 中插入 group、document 或 canvas 条目；parentId 只能为空或指向 group，不接收任何领域内容 JSON。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema,
        parentId: uuidSchema.nullable().optional(),
        index: z.number().int().min(0).optional(),
        entry: z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('group'), name: z.string().min(1).max(100) }),
          z.strictObject({ kind: z.literal('document'), title: z.string().min(1).max(100) }),
          z.strictObject({ kind: z.literal('canvas'), title: z.string().min(1).max(100) }),
        ]),
      }),
      run: async ({ vaultId, parentId, index, entry }) => {
        const item = entry as { kind: 'group' | 'document' | 'canvas'; name?: string; title?: string }
        const parent = parentId === undefined ? null : parentId as string | null
        return jsonData(item.kind === 'group'
          ? await service.createGroup(String(vaultId), parent, item.name!, index as number | undefined, 'mcp')
          : await service.createContent(String(vaultId), item.kind, item.title!, parent, index as number | undefined, 'mcp'))
      },
    },
    {
      name: 'tree_update', description: '按条目类型重命名和/或移动 VaultTreeV2 条目；group 使用 name，document/canvas 使用 title，parentId 只能指向 group。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, entryId: uuidSchema,
        patch: z.strictObject({
          name: z.string().min(1).max(100).optional(),
          title: z.string().min(1).max(100).optional(),
          parentId: uuidSchema.nullable().optional(),
          index: z.number().int().min(0).optional(),
        }).refine((value) => Object.keys(value).length > 0, '更新不能为空'),
      }),
      run: async ({ vaultId, entryId, patch }) => jsonData(await service.updateTreeEntry(
        String(vaultId), String(entryId), patch as never, 'mcp',
      )),
    },
    {
      name: 'tree_delete', description: '删除一个树条目；内容条目会连同顶层 backing resource 删除。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, entryId: uuidSchema, confirm: z.literal(true) }),
      run: async ({ vaultId, entryId }) => jsonData(
        await service.deleteTreeEntry(String(vaultId), String(entryId), 'mcp'),
      ),
    },
    {
      name: 'document_get', description: '读取完整 TipTap 文档或指定稳定节点快照。', readOnly: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, documentId: uuidSchema, nodeIds: batchIdsSchema.optional() }),
      run: async ({ vaultId, documentId, nodeIds }) => jsonData(nodeIds
        ? await service.getDocumentNodeSnapshots(String(vaultId), String(documentId), nodeIds as string[])
        : await service.getDocument(String(vaultId), String(documentId))),
    },
    {
      name: 'document_search', description: '搜索一个或全部文档并返回可直接更新的原生 TipTap 节点。', readOnly: true,
      inputSchema: z.strictObject({
        vaultId: uuidSchema, documentId: uuidSchema.optional(), query: z.string().min(1),
        nodeTypes: z.array(z.enum(TIPTAP_NODE_TYPES)).max(50).optional(),
        caseSensitive: z.boolean().optional(), limit: searchLimitSchema,
      }),
      run: async ({ vaultId, query, documentId, nodeTypes, caseSensitive, limit }) => jsonData(
        await service.searchDocumentNodes(String(vaultId), String(query), {
          documentId: documentId as string | undefined,
          nodeTypes: nodeTypes as string[] | undefined,
          caseSensitive: caseSensitive as boolean | undefined,
          limit: limit as number | undefined,
        }),
      ),
    },
    {
      name: 'document_insert', description: '插入编辑器支持的原生 TipTap JSON。根级块节点必须使用 parentNodeId=null；paragraph/heading 只能包含 text、hardBreak、documentReference。内部文档引用使用 documentReference + attrs.documentId；附件须先 asset_import，再插入 fileAttachment + attrs.assetId/fileName/mimeType/size；Details 必须为 details > detailsSummary(text*) + detailsContent(block+)；下划线/高亮写在 text.marks。所有非 text 节点使用稳定 attrs.nodeId。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, documentId: uuidSchema,
        parentNodeId: uuidSchema.nullable().optional(), index: z.number().int().min(0).optional(),
        nodes: z.array(tipTapNodeSchema).min(1).max(200),
      }),
      run: async ({ vaultId, documentId, parentNodeId, index, nodes }) => jsonData(
        await service.insertDocumentNodeBatch(
          String(vaultId), String(documentId), parentNodeId === undefined ? null : parentNodeId as string | null,
          index as number | undefined, nodes as never, 'mcp',
        ),
      ),
    },
    {
      name: 'document_update', description: '按稳定节点 ID 只更新明确提交的 type、attrs 或完整 content[]，未提交字段保持不变。更新后的整篇文档仍须满足原生 TipTap 内容模型；文档引用改 attrs.documentId/label，附件元数据须与所属资源一致，underline/highlight 属于 text.marks，Details 始终保持 summary + content 两个子节点。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, documentId: uuidSchema,
        updates: z.array(z.strictObject({
          nodeId: uuidSchema, type: z.enum(TIPTAP_NODE_TYPES).optional(), attrs: attrsPatchSchema.optional(),
          content: z.array(tipTapNodeSchema).nullable().optional(),
        }).refine((value) => Object.keys(value).some((key) => key !== 'nodeId'), '节点更新不能为空')).min(1).max(200),
      }),
      run: async ({ vaultId, documentId, updates }) => {
        const loaded = await service.updateDocumentNodeBatch(
          String(vaultId), String(documentId), updates as never, 'mcp',
        )
        const requested = new Set((updates as Array<{ nodeId: string }>).map((item) => item.nodeId))
        return jsonData(documentNodeSnapshots(String(documentId), loaded.content)
          .filter((snapshot) => requested.has(snapshot.nodeId)))
      },
    },
    {
      name: 'document_delete', description: '删除指定 TipTap 稳定节点及其子树。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, documentId: uuidSchema, nodeIds: batchIdsSchema }),
      run: async ({ vaultId, documentId, nodeIds }) => jsonData(await service.deleteDocumentNodes(
        String(vaultId), String(documentId), nodeIds as string[], 'mcp',
      )),
    },
    {
      name: 'canvas_create', description: '创建经过完整 scene、元素 ID、绑定和文件引用校验的原生 Excalidraw scene，不修改文档；随后用 document_insert 插入 canvasReference。',
      inputSchema: z.strictObject({ vaultId: uuidSchema, documentId: uuidSchema, scene: excalidrawSceneSchema.optional() }),
      run: async ({ vaultId, documentId, scene }) => jsonData(await service.createEmbeddedCanvas(
        String(vaultId), String(documentId), (scene ?? {
          type: 'excalidraw', version: 2, source: 'localkb-mcp', elements: [], appState: {}, files: {},
        }) as never, 'mcp',
      )),
    },
    {
      name: 'canvas_get', description: '读取完整 Excalidraw scene 或指定元素快照。', readOnly: true,
      inputSchema: z.strictObject({
        vaultId: uuidSchema, canvasId: uuidSchema,
        elementIds: nativeBatchIdsSchema.optional(), includeRelatedFiles: z.boolean().optional(),
      }),
      run: async ({ vaultId, canvasId, elementIds, includeRelatedFiles }) => {
        if (!elementIds) return jsonData(await service.getCanvasScene(String(vaultId), String(canvasId)))
        const scene = await service.getCanvasScene(String(vaultId), String(canvasId))
        const elements = await service.getCanvasElementSnapshots(String(vaultId), String(canvasId), elementIds as string[])
        const fileIds = new Set(elements.flatMap(({ element }) => typeof element.fileId === 'string' ? [element.fileId] : []))
        return jsonData({
          elements,
          ...(includeRelatedFiles ? { files: Object.fromEntries(Object.entries(scene.files).filter(([id]) => fileIds.has(id))) } : {}),
        })
      },
    },
    {
      name: 'canvas_search', description: '搜索画布可见字段并返回原生 Excalidraw 元素。', readOnly: true,
      inputSchema: z.strictObject({
        vaultId: uuidSchema, canvasId: uuidSchema, query: z.string().min(1),
        elementTypes: z.array(excalidrawElementTypeSchema).max(50).optional(),
        frameId: nativeIdSchema.optional(), groupId: nativeIdSchema.optional(),
        caseSensitive: z.boolean().optional(), limit: searchLimitSchema,
      }),
      run: async ({ vaultId, canvasId, query, ...options }) => jsonData(await service.searchCanvas(
        String(vaultId), String(canvasId), String(query), options as never,
      )),
    },
    {
      name: 'canvas_insert', description: '在 Excalidraw elements[] 的明确层级位置插入完整原生元素和可选 files；提交后的元素 ID、绑定、frame/container 和 file 引用必须全部可解析。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, canvasId: uuidSchema,
        elements: z.array(excalidrawElementSchema).min(1).max(500),
        files: z.record(z.string(), excalidrawFileSchema).optional(),
        placement: z.union([
          z.strictObject({ position: z.enum(['back', 'front']) }),
          z.strictObject({ beforeElementId: nativeIdSchema }),
          z.strictObject({ afterElementId: nativeIdSchema }),
        ]),
      }),
      run: async ({ vaultId, canvasId, elements, files, placement }) => jsonData(
        await service.insertCanvasElementBatch(
          String(vaultId), String(canvasId), elements as never,
          files as Record<string, JsonObject> | undefined, placement as never, 'mcp',
        ),
      ),
    },
    {
      name: 'canvas_update', description: '更新 Excalidraw elements、order、appState 或 files 的明确字段；服务对合并后的完整 scene 做结构与引用校验后才提交。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, canvasId: uuidSchema,
        update: z.strictObject({
          elementUpdates: z.array(z.strictObject({
            elementId: nativeIdSchema, set: jsonObjectSchema.optional(),
            unset: z.array(z.string().min(1)).max(100).optional(),
          })).min(1).max(500).optional(),
          elementOrder: nativeBatchIdsSchema.optional(),
          appState: attrsPatchSchema.optional(),
          files: z.strictObject({
            set: z.record(z.string(), excalidrawFileSchema).optional(),
            delete: z.array(nativeIdSchema).max(500).optional(),
          }).optional(),
        }).refine((value) => Object.keys(value).length > 0, '画布更新不能为空'),
      }),
      run: async ({ vaultId, canvasId, update }) => jsonData(await service.updateCanvas(
        String(vaultId), String(canvasId), update as never, 'mcp',
      )),
    },
    {
      name: 'canvas_delete', description: '从 Excalidraw elements[] 删除明确元素；若删除会留下绑定、frame/container 或 file 悬空引用则整批拒绝。', destructive: true,
      inputSchema: z.strictObject({
        vaultId: uuidSchema, canvasId: uuidSchema, elementIds: nativeBatchIdsSchema,
        removeUnreferencedFiles: z.boolean().optional(),
      }),
      run: async ({ vaultId, canvasId, elementIds, removeUnreferencedFiles }) => jsonData(
        await service.deleteCanvasElementBatch(
          String(vaultId), String(canvasId), elementIds as string[], Boolean(removeUnreferencedFiles), 'mcp',
        ),
      ),
    },
    {
      name: 'canvas_remove', description: '删除一个已无文档引用的嵌入画布资源。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, canvasId: uuidSchema }),
      run: async ({ vaultId, canvasId }) => jsonData(await service.removeCanvas(String(vaultId), String(canvasId), 'mcp')),
    },
    {
      name: 'mindmap_create', description: '创建具有唯一 node.id、字符串 topic 和合法 children[] 的原生 MindElixir 树，不修改文档；随后用 document_insert 插入 mindmapReference。',
      inputSchema: z.strictObject({ vaultId: uuidSchema, documentId: uuidSchema, data: mindMapDataSchema }),
      run: async ({ vaultId, documentId, data }) => jsonData(await service.createMindMap(
        String(vaultId), String(documentId), data as never, 'mcp',
      )),
    },
    {
      name: 'mindmap_get', description: '读取完整 MindElixir 数据或指定节点快照。', readOnly: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, mindMapId: uuidSchema, nodeIds: nativeBatchIdsSchema.optional() }),
      run: async ({ vaultId, mindMapId, nodeIds }) => jsonData(nodeIds
        ? await service.getMindMapNodeSnapshots(String(vaultId), String(mindMapId), nodeIds as string[])
        : await service.getMindMapById(String(vaultId), String(mindMapId))),
    },
    {
      name: 'mindmap_search', description: '搜索思维导图字段并返回原生 MindElixir 节点。', readOnly: true,
      inputSchema: z.strictObject({
        vaultId: uuidSchema, mindMapId: uuidSchema, query: z.string().min(1),
        fields: z.array(z.enum(['tags', 'icons', 'hyperLink'])).max(3).optional(),
        caseSensitive: z.boolean().optional(), limit: searchLimitSchema,
      }),
      run: async ({ vaultId, mindMapId, query, ...options }) => jsonData(await service.searchMindMap(
        String(vaultId), String(mindMapId), String(query), options as never,
      )),
    },
    {
      name: 'mindmap_insert', description: '向父节点 children[] 的明确位置插入完整原生 MindElixir 子树；所有新增和既有 node.id 在整棵树中必须唯一。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, mindMapId: uuidSchema, parentNodeId: nativeIdSchema,
        index: z.number().int().min(0).optional(), nodes: z.array(mindMapNodeSchema).min(1).max(200),
      }),
      run: async ({ vaultId, mindMapId, parentNodeId, index, nodes }) => jsonData(
        await service.insertMindMapNodeBatch(
          String(vaultId), String(mindMapId), String(parentNodeId), index as number | undefined,
          nodes as never, 'mcp',
        ),
      ),
    },
    {
      name: 'mindmap_update', description: '更新 MindElixir 节点除 id/children 外明确提交的字段；合并后的节点仍必须具有合法 id、字符串 topic 和 children 树。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, mindMapId: uuidSchema,
        updates: z.array(z.strictObject({
          nodeId: nativeIdSchema, set: jsonObjectSchema.optional(),
          unset: z.array(z.string().min(1)).max(100).optional(),
        }).refine((value) => value.set !== undefined || value.unset !== undefined, '节点更新不能为空')).min(1).max(200),
      }),
      run: async ({ vaultId, mindMapId, updates }) => jsonData(await service.updateMindMapNodeBatch(
        String(vaultId), String(mindMapId), updates as never, 'mcp',
      )),
    },
    {
      name: 'mindmap_move', description: '显式改变 MindElixir 节点的父节点或兄弟位置；根节点不可移动，整批不得产生循环、重复 ID 或无效位置。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, mindMapId: uuidSchema,
        moves: z.array(z.strictObject({
          nodeId: nativeIdSchema, parentNodeId: nativeIdSchema, index: z.number().int().min(0).optional(),
        })).min(1).max(200),
      }),
      run: async ({ vaultId, mindMapId, moves }) => jsonData(await service.moveMindMapNodeBatch(
        String(vaultId), String(mindMapId), moves as never, 'mcp',
      )),
    },
    {
      name: 'mindmap_delete', description: '删除明确指定的 MindElixir 节点及其子树。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, mindMapId: uuidSchema, nodeIds: nativeBatchIdsSchema }),
      run: async ({ vaultId, mindMapId, nodeIds }) => jsonData(await service.deleteMindMapNodeBatch(
        String(vaultId), String(mindMapId), nodeIds as string[], 'mcp',
      )),
    },
    {
      name: 'mindmap_remove', description: '删除一个已无文档引用的思维导图资源。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, mindMapId: uuidSchema }),
      run: async ({ vaultId, mindMapId }) => jsonData(await service.removeMindMap(String(vaultId), String(mindMapId), 'mcp')),
    },
    {
      name: 'asset_import', description: '从 canonical base64 无损导入文档所属资产，不修改文档。图片随后插入 assetImage；普通文件随后插入 fileAttachment，并逐字使用返回的 id、mimeType、byteLength 以及输入 fileName 作为 attrs.assetId/mimeType/size/fileName。',
      inputSchema: z.strictObject({
        vaultId: uuidSchema, documentId: uuidSchema, mimeType: z.string().min(1).max(100),
        fileName: z.string().min(1).max(255).optional(),
        dataBase64: z.string().min(4).max(Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 4),
      }),
      run: async ({ vaultId, documentId, mimeType, fileName, dataBase64 }) => {
        const bytes = canonicalBase64(String(dataBase64))
        const result = await service.importAsset(
          String(vaultId), String(documentId), String(mimeType), bytes, 'mcp',
          fileName === undefined ? undefined : String(fileName),
        )
        return jsonData({ ...result, byteLength: bytes.byteLength })
      },
    },
    {
      name: 'asset_get', description: '读取附件元数据，并按需返回 base64 原始字节。', readOnly: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, assetId: uuidSchema, includeData: z.boolean().optional() }),
      run: async ({ vaultId, assetId, includeData }) => {
        const asset = await service.readAssetById(String(vaultId), String(assetId))
        return jsonData({
          assetId: asset.id, mimeType: asset.mimeType, byteLength: asset.bytes.byteLength,
          documentId: asset.documentId,
          ...(includeData ? { dataBase64: Buffer.from(asset.bytes).toString('base64') } : {}),
        })
      },
    },
    {
      name: 'asset_remove', description: '删除一个已无文档引用的附件资源。', destructive: true,
      inputSchema: z.strictObject({ vaultId: uuidSchema, assetId: uuidSchema }),
      run: async ({ vaultId, assetId }) => jsonData(await service.removeAsset(String(vaultId), String(assetId), 'mcp')),
    },
  ]
  return definitions
}

export function registerMcpTools(server: McpServer, service: KnowledgeService): void {
  for (const definition of createMcpToolDefinitions(service)) {
    server.registerTool(definition.name, {
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: toolOutputSchema,
      annotations: {
        readOnlyHint: definition.readOnly ?? false,
        destructiveHint: definition.destructive ?? false,
      },
    }, async (input) => {
      try {
        const payload = { ok: true as const, data: await definition.run(input as Record<string, unknown>) }
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], structuredContent: payload }
      } catch (error) {
        const normalized = asKnowledgeError(error)
        const payload = {
          ok: false as const,
          error: {
            code: normalized.code,
            message: normalized.message,
            ...(normalized.details === undefined ? {} : { details: normalized.details }),
          },
        }
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        }
      }
    })
  }
}
