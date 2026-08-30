import { z } from 'zod'
import {
  EXCALIDRAW_ELEMENT_TYPES,
  TIPTAP_MARK_TYPES,
  TIPTAP_NODE_TYPES,
  TIPTAP_REFERENCE_NODE_TYPES,
} from '../../shared/knowledge-types'
import type {
  ExcalidrawElement,
  ExcalidrawScene,
  JsonObject,
  JsonValue,
  MindMapData,
  MindMapNodeData,
  TipTapNode,
  TipTapNodeType,
} from '../../shared/knowledge-types'
import {
  assertExcalidrawElement,
  assertMindMapData,
  assertTipTapNodeFragment,
} from '../../shared/knowledge-validation'

export const uuidSchema = z.uuid()
export const nativeIdSchema = z.string().min(1).max(256)
export const batchIdsSchema = z.array(uuidSchema).min(1).max(200)
export const nativeBatchIdsSchema = z.array(nativeIdSchema).min(1).max(500)
export const searchLimitSchema = z.number().int().min(1).max(200).optional()

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]))

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema)

const tipTapMarkSchema = z.object({
  type: z.enum(TIPTAP_MARK_TYPES),
  attrs: jsonObjectSchema.optional(),
}).catchall(jsonValueSchema)

const TIPTAP_NODE_GUIDE = [
  '原生 TipTap 节点。doc/blockquote/tableCell/tableHeader 包含块节点；paragraph/heading 只包含 text、hardBreak 或 documentReference。',
  '内部引用：{"type":"documentReference","attrs":{"nodeId":"UUID","documentId":"同库文档 UUID","label":"回退标题"}}。',
  '附件：先 asset_import，再插入 {"type":"fileAttachment","attrs":{"nodeId":"UUID","assetId":"返回 UUID","fileName":"原文件名","mimeType":"MIME","size":字节数}}。',
  'Details 必须依次包含 detailsSummary(text*) 与 detailsContent(block+)；三类节点都使用 attrs.nodeId。',
  '下划线和高亮写在 text.marks：{"type":"underline"}、{"type":"highlight","attrs":{"color":"#FEF08A"}}。',
  'canvasReference、mindmapReference、assetImage、fileAttachment、documentReference 都不能包含 content。',
].join(' ')

export const tipTapNodeSchema: z.ZodType<TipTapNode> = z.lazy(() => z.object({
  type: z.enum(TIPTAP_NODE_TYPES),
  attrs: jsonObjectSchema.optional(),
  content: z.array(tipTapNodeSchema).optional(),
  marks: z.array(tipTapMarkSchema).optional(),
  text: z.string().optional(),
}).catchall(jsonValueSchema).superRefine((node, context) => {
  const referenceIdAttr = ({
    [TIPTAP_REFERENCE_NODE_TYPES.canvas]: 'canvasId',
    [TIPTAP_REFERENCE_NODE_TYPES.mindmap]: 'mindmapId',
    [TIPTAP_REFERENCE_NODE_TYPES.asset]: 'assetId',
  } as Partial<Record<TipTapNodeType, 'canvasId' | 'mindmapId' | 'assetId'>>)[node.type]
  if (!referenceIdAttr) return
  if (!uuidSchema.safeParse(node.attrs?.[referenceIdAttr]).success) {
    context.addIssue({
      code: 'custom', path: ['attrs', referenceIdAttr],
      message: `${node.type} 必须提供有效的 attrs.${referenceIdAttr}`,
    })
  }
  if (node.content !== undefined) {
    context.addIssue({ code: 'custom', path: ['content'], message: `${node.type} 不能包含 content` })
  }
}).superRefine((node, context) => {
  try {
    assertTipTapNodeFragment(node)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'TipTap 节点结构无效',
    })
  }
})).describe(TIPTAP_NODE_GUIDE) as z.ZodType<TipTapNode>

const excalidrawBoundElementSchema = z.object({
  id: nativeIdSchema,
  type: z.enum(['arrow', 'text']),
}).catchall(jsonValueSchema)
const excalidrawPointSchema = z.tuple([z.number().finite(), z.number().finite()])
const excalidrawBindingSchema = z.object({
  elementId: nativeIdSchema,
  focus: z.number().finite(),
  gap: z.number().finite(),
}).catchall(jsonValueSchema)
const excalidrawBaseElementFields = {
  id: nativeIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
  angle: z.number().finite(),
  strokeColor: z.string(),
  backgroundColor: z.string(),
  fillStyle: z.enum(['hachure', 'cross-hatch', 'solid', 'zigzag']),
  strokeWidth: z.number().finite(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']),
  roughness: z.number().finite(),
  opacity: z.number().finite().min(0).max(100),
  groupIds: z.array(z.string()),
  frameId: nativeIdSchema.nullable(),
  index: z.string().nullable(),
  roundness: z.object({ type: z.union([z.literal(1), z.literal(2), z.literal(3)]), value: z.number().finite().optional() }).catchall(jsonValueSchema).nullable(),
  seed: z.number().finite(),
  version: z.number().int().min(1),
  versionNonce: z.number().finite(),
  isDeleted: z.boolean(),
  boundElements: z.array(excalidrawBoundElementSchema).nullable(),
  updated: z.number().finite(),
  link: z.string().nullable(),
  locked: z.boolean(),
}
const excalidrawGenericElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.enum(['selection', 'rectangle', 'diamond', 'ellipse', 'iframe', 'embeddable']),
}).catchall(jsonValueSchema)
const excalidrawTextElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.literal('text'),
  fontSize: z.number().finite().min(1),
  fontFamily: z.number().finite(),
  text: z.string(),
  textAlign: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
  containerId: nativeIdSchema.nullable(),
  originalText: z.string(),
  autoResize: z.boolean(),
  lineHeight: z.number().finite().min(0),
}).catchall(jsonValueSchema)
const excalidrawLineElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.literal('line'),
  points: z.array(excalidrawPointSchema).min(1),
  lastCommittedPoint: excalidrawPointSchema.nullable(),
  startBinding: excalidrawBindingSchema.nullable(),
  endBinding: excalidrawBindingSchema.nullable(),
  startArrowhead: z.enum(['arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many']).nullable(),
  endArrowhead: z.enum(['arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many']).nullable(),
}).catchall(jsonValueSchema)
const excalidrawArrowElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.literal('arrow'),
  points: z.array(excalidrawPointSchema).min(1),
  lastCommittedPoint: excalidrawPointSchema.nullable(),
  startBinding: excalidrawBindingSchema.nullable(),
  endBinding: excalidrawBindingSchema.nullable(),
  startArrowhead: z.enum(['arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many']).nullable(),
  endArrowhead: z.enum(['arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many']).nullable(),
  elbowed: z.boolean(),
}).catchall(jsonValueSchema)
const excalidrawFreeDrawElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.literal('freedraw'),
  points: z.array(excalidrawPointSchema).min(1),
  pressures: z.array(z.number().finite()),
  simulatePressure: z.boolean(),
  lastCommittedPoint: excalidrawPointSchema.nullable(),
}).catchall(jsonValueSchema)
const excalidrawImageElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.literal('image'),
  fileId: nativeIdSchema.nullable(),
  status: z.enum(['pending', 'saved', 'error']),
  scale: z.tuple([z.number().finite(), z.number().finite()]),
  crop: z.strictObject({
    x: z.number().finite(), y: z.number().finite(),
    width: z.number().finite(), height: z.number().finite(),
    naturalWidth: z.number().finite(), naturalHeight: z.number().finite(),
  }).nullable(),
}).catchall(jsonValueSchema)
const excalidrawFrameElementSchema = z.object({
  ...excalidrawBaseElementFields,
  type: z.enum(['frame', 'magicframe']),
  name: z.string().nullable(),
}).catchall(jsonValueSchema)

export const excalidrawElementSchema = z.union([
  excalidrawGenericElementSchema,
  excalidrawTextElementSchema,
  excalidrawLineElementSchema,
  excalidrawArrowElementSchema,
  excalidrawFreeDrawElementSchema,
  excalidrawImageElementSchema,
  excalidrawFrameElementSchema,
]).superRefine((element, context) => {
  try {
    assertExcalidrawElement(element)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Excalidraw 元素结构无效',
    })
  }
}).describe('完整原生 ExcalidrawElement；必须提交基础几何、样式、版本、层级和绑定字段，并按 type 提交 text/points/file 等专有字段。') as z.ZodType<ExcalidrawElement>

export const excalidrawFileSchema = z.object({
  id: nativeIdSchema,
  mimeType: z.string().min(1),
  dataURL: z.string().min(1),
  created: z.number().finite(),
  lastRetrieved: z.number().finite().optional(),
  version: z.number().finite().optional(),
}).catchall(jsonValueSchema).describe('原生 Excalidraw BinaryFileData；记录键必须与 id 相同。')

export const excalidrawSceneSchema = z.object({
  type: z.literal('excalidraw'),
  version: z.number().int().min(1),
  source: z.string(),
  elements: z.array(excalidrawElementSchema),
  appState: jsonObjectSchema,
  files: z.record(z.string(), excalidrawFileSchema),
}).catchall(jsonValueSchema).describe('原生 Excalidraw scene。元素、files、绑定、frame/container 和文件引用会在完整 scene 上统一校验。') as z.ZodType<ExcalidrawScene>

const mindMapStyleSchema = z.strictObject({
  fontSize: z.string().optional(),
  fontFamily: z.string().optional(),
  color: z.string().optional(),
  background: z.string().optional(),
  fontWeight: z.string().optional(),
  width: z.string().optional(),
  border: z.string().optional(),
  textDecoration: z.string().optional(),
})

const mindMapTagSchema = z.union([
  z.string(),
  z.strictObject({
    text: z.string(),
    style: z.record(z.string(), z.string()).optional(),
    className: z.string().optional(),
  }),
])

export const mindMapNodeSchema: z.ZodType<MindMapNodeData> = z.lazy(() => z.object({
  id: nativeIdSchema,
  topic: z.string(),
  children: z.array(mindMapNodeSchema).optional(),
  style: mindMapStyleSchema.optional(),
  tags: z.array(mindMapTagSchema).optional(),
  icons: z.array(z.string()).optional(),
  hyperLink: z.string().optional(),
  expanded: z.boolean().optional(),
  direction: z.union([z.literal(0), z.literal(1)]).optional(),
  image: z.strictObject({
    url: z.string(), width: z.number().finite(), height: z.number().finite(),
    fit: z.enum(['fill', 'contain', 'cover']).optional(),
  }).optional(),
  branchColor: z.string().optional(),
  dangerouslySetInnerHTML: z.string().optional(),
  note: z.string().optional(),
  metadata: jsonValueSchema.optional(),
}).catchall(jsonValueSchema)).superRefine((node, context) => {
  try {
    assertMindMapData({ nodeData: node })
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'MindElixir 节点结构无效',
    })
  }
}).describe('原生 MindElixir NodeObj；id 在整棵树中唯一，topic 必须是字符串，children 只包含同结构子节点；样式、标签、图标、链接、方向和图片字段使用 MindElixir 原生类型。') as z.ZodType<MindMapNodeData>

export const mindMapDataSchema = z.object({
  nodeData: mindMapNodeSchema,
  arrows: z.array(z.object({
    id: nativeIdSchema, label: z.string(), from: nativeIdSchema, to: nativeIdSchema,
    delta1: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(),
    delta2: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(),
    bidirectional: z.boolean().optional(),
    style: z.strictObject({
      stroke: z.string().optional(),
      strokeWidth: z.union([z.string(), z.number().finite()]).optional(),
      strokeDasharray: z.string().optional(),
      strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
      opacity: z.union([z.string(), z.number().finite()]).optional(),
      labelColor: z.string().optional(),
    }).optional(),
    metadata: jsonValueSchema.optional(),
  }).catchall(jsonValueSchema)).optional(),
  summaries: z.array(z.object({
    id: nativeIdSchema, label: z.string(), parent: nativeIdSchema,
    start: z.number().int().min(0), end: z.number().int().min(0),
    style: z.strictObject({
      stroke: z.string().optional(), labelColor: z.string().optional(),
    }).optional(),
  }).catchall(jsonValueSchema)).optional(),
  direction: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  theme: z.object({
    name: z.string(),
    type: z.enum(['light', 'dark']).optional(),
    palette: z.array(z.string()),
    cssVar: z.record(z.string(), z.string()).optional(),
  }).catchall(jsonValueSchema).optional(),
  compact: z.boolean().optional(),
  meta: jsonObjectSchema.optional(),
}).catchall(jsonValueSchema).superRefine((data, context) => {
  try {
    assertMindMapData(data)
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'MindElixir 数据结构无效',
    })
  }
}).describe('原生 MindElixirData；nodeData 是唯一根节点，可包含原生 arrows、summaries、direction、theme、compact 和 meta。') as z.ZodType<MindMapData>

export const excalidrawElementTypeSchema = z.enum(EXCALIDRAW_ELEMENT_TYPES)

export const attrsPatchSchema = z.strictObject({
  set: jsonObjectSchema.optional(),
  unset: z.array(z.string().min(1)).max(100).optional(),
})

const knowledgeErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  details: jsonValueSchema.optional(),
})

export const toolOutputSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: jsonValueSchema }),
  z.strictObject({ ok: z.literal(false), error: knowledgeErrorSchema }),
])
