import { VAULT_FORMAT_VERSIONS } from '../../shared/knowledge-types'
import type {
  ExcalidrawScene,
  MindMapData,
  TipTapDocument,
  VaultTreeV3,
  VaultV3,
} from '../../shared/knowledge-types'

export const V3_FIXTURE_IDS = {
  vault: '10000000-0000-4000-8000-000000000001',
  documentA: '20000000-0000-4000-8000-000000000001',
  documentB: '20000000-0000-4000-8000-000000000002',
  canvasTop: '30000000-0000-4000-8000-000000000001',
  canvasEmbedded: '30000000-0000-4000-8000-000000000002',
  mindmapTop: '40000000-0000-4000-8000-000000000001',
  mindmapEmbedded: '40000000-0000-4000-8000-000000000002',
  sharedAsset: '50000000-0000-4000-8000-000000000001',
} as const

const timestamp = '2026-08-30T00:00:00.000Z'

export const V3_VAULT_FIXTURE: VaultV3 = {
  schemaVersion: 3,
  formatVersions: { ...VAULT_FORMAT_VERSIONS },
  id: V3_FIXTURE_IDS.vault,
  name: 'V3 fixture',
  createdAt: timestamp,
}

export const V3_TREE_FIXTURE: VaultTreeV3 = {
  schemaVersion: 3,
  entries: [
    {
      kind: 'content', id: V3_FIXTURE_IDS.documentA, contentType: 'document', title: '文档 A',
      parentId: null, order: 0, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      kind: 'content', id: V3_FIXTURE_IDS.documentB, contentType: 'document', title: '文档 B',
      parentId: null, order: 1, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      kind: 'content', id: V3_FIXTURE_IDS.canvasTop, contentType: 'canvas', title: '顶层画布',
      parentId: null, order: 2, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      kind: 'content', id: V3_FIXTURE_IDS.mindmapTop, contentType: 'mindmap', title: '顶层导图',
      parentId: null, order: 3, createdAt: timestamp, updatedAt: timestamp,
    },
  ],
}

export const V3_CANVAS_FIXTURE: ExcalidrawScene = {
  type: 'excalidraw', version: 2, source: 'localkb-v3-fixture',
  elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {},
}

export const V3_MINDMAP_FIXTURE: MindMapData = {
  nodeData: { id: 'root', topic: '中心主题', children: [{ id: 'child', topic: '子节点' }] },
  direction: 2,
}

export function v3DocumentFixture(sharedNodeSuffix: '1' | '2' = '1'): TipTapDocument {
  const nodeId = (prefix: string) => `${prefix}0000000-0000-4000-8000-00000000000${sharedNodeSuffix}`
  return {
    type: 'doc',
    content: [
      { type: 'canvasReference', attrs: { nodeId: nodeId('6'), canvasId: V3_FIXTURE_IDS.canvasEmbedded } },
      { type: 'mindmapReference', attrs: { nodeId: nodeId('7'), mindmapId: V3_FIXTURE_IDS.mindmapEmbedded } },
      { type: 'assetImage', attrs: { nodeId: nodeId('8'), assetId: V3_FIXTURE_IDS.sharedAsset, alt: '共享图片' } },
      { type: 'fileAttachment', attrs: { nodeId: nodeId('9'), assetId: V3_FIXTURE_IDS.sharedAsset, displayName: '共享附件.bin' } },
      { type: 'image', attrs: { nodeId: nodeId('a'), src: 'https://example.com/external.png', alt: '外部图片' } },
    ],
  }
}
