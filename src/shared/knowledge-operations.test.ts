import { describe, expect, it } from 'vitest'
import type {
  ExcalidrawElement,
  ExcalidrawScene,
  MindMapData,
  TipTapDocument,
} from './knowledge-types'
import {
  appendDocumentNodes,
  collectDocumentReferences,
  deleteCanvasElements,
  deleteCanvasElementsStrict,
  deleteCanvasFiles,
  deleteDocumentNodes,
  deleteMindMapNode,
  deleteMindMapNodes,
  documentNodeSnapshots,
  insertCanvasElements,
  insertDocumentNodes,
  insertMindMapNode,
  insertMindMapNodes,
  moveMindMapNode,
  moveMindMapNodes,
  normalizeDocumentNodeIds,
  patchCanvasElements,
  patchDocumentNode,
  patchMindMapNode,
  reorderCanvasElements,
  replaceCanvasScene,
  replaceDocumentNode,
  replaceDocumentText,
  replaceMindMapData,
  searchCanvasElements,
  searchDocumentNodeSnapshots,
  searchMindMapNodes,
  updateCanvasScene,
  updateDocumentNodes,
  updateMindMapNodes,
  upsertCanvasElements,
  upsertCanvasFiles,
} from './knowledge-operations'
import {
  assertExcalidrawScene,
  assertJsonObject,
  assertPathSegment,
  assertTipTapDocument,
  assertUuid,
  isJsonValue,
  KnowledgeValidationError,
  normalizeTipTapDocumentStructure,
} from './knowledge-validation'

const NODE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NODE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NODE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CANVAS_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function element(
  id: string,
  type: ExcalidrawElement['type'],
  extra: Record<string, unknown> = {},
): ExcalidrawElement {
  const base = {
    id, type, x: 0, y: 0, width: 100, height: 100, angle: 0,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
    strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, index: null, roundness: null,
    seed: 1, version: 1, versionNonce: 1, isDeleted: false,
    boundElements: null, updated: 1, link: null, locked: false,
  }
  const typed = type === 'arrow' || type === 'line'
    ? {
        points: [[0, 0], [100, 100]], lastCommittedPoint: null,
        startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
        ...(type === 'arrow' ? { elbowed: false } : {}),
      }
    : type === 'image'
      ? { fileId: null, status: 'saved', scale: [1, 1], crop: null }
      : type === 'text'
        ? {
            fontSize: 20, fontFamily: 5, text: '', textAlign: 'left', verticalAlign: 'top',
            containerId: null, originalText: '', autoResize: true, lineHeight: 1.25,
          }
        : {}
  return { ...base, ...typed, ...extra } as ExcalidrawElement
}

function document(): TipTapDocument {
  return {
    type: 'doc',
    futureRoot: { enabled: true },
    content: [
      {
        type: 'paragraph',
        attrs: { nodeId: NODE_A, futureAttr: 9 },
        content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }],
      },
      {
        type: 'canvasReference',
        attrs: { nodeId: NODE_B, canvasId: CANVAS_ID, width: 480 },
      },
    ],
  }
}

function scene(): ExcalidrawScene {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements: [
      element('shape-a', 'rectangle', {
        futureElement: { value: 1 },
        boundElements: [{ id: 'arrow-b', type: 'arrow' }],
      }),
      element('arrow-b', 'arrow', {
        startBinding: { elementId: 'shape-a', focus: 0, gap: 0 },
      }),
      element('image-c', 'image', { fileId: 'file-a' }),
    ],
    appState: { viewBackgroundColor: '#fff', futureState: 'kept' },
    files: {
      'file-a': {
        id: 'file-a', mimeType: 'image/png', dataURL: 'data:image/png;base64,AA==', created: 1,
      },
    },
    futureScene: { enabled: true },
  }
}

function mindMap(): MindMapData {
  return {
    nodeData: {
      id: 'root',
      topic: 'Root',
      futureNode: { kept: true },
      children: [
        { id: 'a', topic: 'A', children: [{ id: 'a-1', topic: 'A1' }] },
        { id: 'b', topic: 'B' },
      ],
    },
    direction: 2,
  }
}

function errorCode(action: () => unknown): string | undefined {
  try {
    action()
  } catch (error) {
    return error instanceof KnowledgeValidationError ? error.code : undefined
  }
  return undefined
}

describe('native JSON guards', () => {
  it('rejects non-JSON values, invalid IDs, and escaping path segments', () => {
    expect(isJsonValue({ ok: [1, true, null] })).toBe(true)
    expect(isJsonValue({ bad: Number.NaN })).toBe(false)
    expect(() => assertJsonObject({ bad: undefined })).toThrow(KnowledgeValidationError)
    expect(() => assertUuid('not-a-uuid')).toThrow(KnowledgeValidationError)
    expect(() => assertPathSegment('../outside')).toThrow(KnowledgeValidationError)
  })

  it('accepts and preserves unknown JSON-compatible native fields', () => {
    expect(replaceCanvasScene(scene()).futureScene).toEqual({ enabled: true })
    expect(replaceMindMapData(mindMap()).direction).toBe(2)
  })

  it('rejects document types that the renderer cannot parse', () => {
    expect(() => assertTipTapDocument({
      type: 'doc',
      content: [{ type: 'excalidraw', attrs: { canvasId: CANVAS_ID } }],
    })).toThrow(/canvasReference/)
    expect(() => assertTipTapDocument({
      type: 'doc', content: [{ type: 'canvasReference', attrs: {} }],
    })).toThrow(/canvasId/)
    expect(() => assertTipTapDocument({
      type: 'doc', content: [{ type: 'paragraph', marks: [{ type: 'futureMark' }] }],
    })).toThrow(/mark 类型不受支持/)
    expect(() => assertTipTapDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'canvasReference', attrs: { canvasId: CANVAS_ID } }],
      }],
    })).toThrow(/paragraph.*只能包含行内节点/)
  })

  it('lifts the block-only wrapper produced by the former MCP document insert path', () => {
    const normalized = normalizeTipTapDocumentStructure({
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { nodeId: NODE_C },
        content: [
          { type: 'canvasReference', attrs: { nodeId: NODE_A, canvasId: CANVAS_ID } },
          { type: 'paragraph', attrs: { nodeId: NODE_B }, content: [{ type: 'text', text: 'after' }] },
        ],
      }],
    })
    expect(normalized.content?.map((node) => node.type)).toEqual(['canvasReference', 'paragraph'])
    expect(normalized.content?.map((node) => node.attrs?.nodeId)).toEqual([NODE_A, NODE_B])
    expect(() => assertTipTapDocument(normalized)).not.toThrow()
  })

  it('rejects dangling canvas bindings and file references', () => {
    const danglingBinding = scene()
    danglingBinding.elements[1].startBinding = { elementId: 'missing', focus: 0, gap: 0 }
    expect(errorCode(() => assertExcalidrawScene(danglingBinding))).toBe('NOT_FOUND')

    const danglingFile = scene()
    danglingFile.elements[2].fileId = 'missing'
    expect(errorCode(() => assertExcalidrawScene(danglingFile))).toBe('NOT_FOUND')
  })
})

describe('TipTap native operations', () => {
  it('assigns deterministic stable IDs and rejects duplicates', () => {
    const ids = [NODE_A, NODE_B]
    const normalized = normalizeDocumentNodeIds({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'heading' }],
    }, () => ids.shift()!)
    expect(normalized.content?.map((node) => node.attrs?.nodeId)).toEqual([NODE_A, NODE_B])
    expect(normalizeDocumentNodeIds(normalized).content?.[0].attrs?.nodeId).toBe(NODE_A)

    const duplicate = document()
    duplicate.content![1].attrs!.nodeId = NODE_A
    expect(errorCode(() => normalizeDocumentNodeIds(duplicate))).toBe('CONFLICT')
  })

  it('inserts, appends, replaces, patches, and deletes nodes by nodeId', () => {
    let value = insertDocumentNodes(document(), null, 1, [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
    ], () => NODE_C)
    expect(value.content?.[1].attrs?.nodeId).toBe(NODE_C)

    expect(() => appendDocumentNodes(value, NODE_C, [
      { type: 'paragraph', attrs: { nodeId: '11111111-1111-4111-8111-111111111111' } },
    ])).toThrow(/heading.*只能包含行内节点/)

    value = appendDocumentNodes(value, NODE_C, [{ type: 'text', text: ' more' }])
    expect(value.content?.[1].content?.[1]).toEqual({ type: 'text', text: ' more' })

    value = patchDocumentNode(value, NODE_C, { attrs: { level: 3, newField: 'kept' } })
    expect(value.content?.[1].attrs).toMatchObject({ level: 3, newField: 'kept', nodeId: NODE_C })

    value = replaceDocumentNode(value, NODE_C, { type: 'blockquote', future: true })
    expect(value.content?.[1]).toMatchObject({
      type: 'blockquote', future: true, attrs: { nodeId: NODE_C },
    })

    value = deleteDocumentNodes(value, [NODE_C])
    expect(value.content?.map((node) => node.attrs?.nodeId)).toEqual([NODE_A, NODE_B])
  })

  it('replaces text ranges across text leaves and collects reference-only nodes', () => {
    const changed = replaceDocumentText(document(), NODE_A, 3, 8, 'p-')
    expect(changed.content?.[0].content?.map((node) => node.text).join('')).toBe('help-rld')
    expect(changed.content?.[0].attrs?.futureAttr).toBe(9)
    expect(collectDocumentReferences(changed)).toEqual([
      { type: 'canvas', id: CANVAS_ID, nodeId: NODE_B },
    ])
  })

  it('rejects ID mutation and unknown node targets', () => {
    expect(errorCode(() => patchDocumentNode(document(), NODE_A, {
      attrs: { nodeId: NODE_C },
    }))).toBe('CONFLICT')
    expect(errorCode(() => deleteDocumentNodes(document(), [NODE_C]))).toBe('NOT_FOUND')
  })

  it('snapshots, searches, and atomically updates only explicit node fields', () => {
    const original = document()
    const snapshots = documentNodeSnapshots('doc', original)
    expect(snapshots[0]).toMatchObject({ nodeId: NODE_A, parentNodeId: null, index: 0, path: [0] })
    expect(searchDocumentNodeSnapshots('doc', original, 'l', { limit: 1 })).toMatchObject({
      totalMatchCount: 3, matchedNodeCount: 1, truncated: false,
    })

    const changed = updateDocumentNodes(original, [{
      nodeId: NODE_A, attrs: { set: { textAlign: 'right' }, unset: ['futureAttr'] },
    }])
    expect(changed.content?.[0]).toMatchObject({
      attrs: { nodeId: NODE_A, textAlign: 'right' },
      content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }],
    })
    expect(original.content?.[0].attrs?.futureAttr).toBe(9)
    expect(errorCode(() => updateDocumentNodes(original, [
      { nodeId: NODE_A, content: [] }, { nodeId: NODE_C, content: [] },
    ]))).toBe('NOT_FOUND')
    expect(original.content?.[0].content?.[0].text).toBe('hello ')
  })

  it('rejects overlapping document subtree deletions', () => {
    const nested: TipTapDocument = { type: 'doc', content: [{
      type: 'blockquote', attrs: { nodeId: NODE_A }, content: [{
        type: 'paragraph', attrs: { nodeId: NODE_B }, content: [{ type: 'text', text: 'nested' }],
      }],
    }] }
    expect(errorCode(() => deleteDocumentNodes(nested, [NODE_A, NODE_B]))).toBe('INVALID_INPUT')
    expect(nested.content?.[0].content?.[0].attrs?.nodeId).toBe(NODE_B)
  })
})

describe('Excalidraw native operations', () => {
  it('upserts, patches, reorders, and preserves unaddressed fields', () => {
    let value = upsertCanvasElements(scene(), [
      element('shape-d', 'ellipse', { roughness: 2 }),
    ])
    value = patchCanvasElements(value, [{ id: 'shape-a', changes: { strokeColor: '#123' } }])
    value = reorderCanvasElements(value, ['shape-d', 'image-c', 'arrow-b', 'shape-a'])
    expect(value.elements.map((element) => element.id)).toEqual(
      ['shape-d', 'image-c', 'arrow-b', 'shape-a'],
    )
    expect(value.elements[3]).toMatchObject({
      futureElement: { value: 1 }, strokeColor: '#123',
    })
    expect(value.appState.futureState).toBe('kept')
  })

  it('cleans bindings on element deletion and protects referenced files', () => {
    const withoutShape = deleteCanvasElements(scene(), ['shape-a'])
    const arrow = withoutShape.elements.find((element) => element.id === 'arrow-b')!
    expect(arrow.startBinding).toBeNull()
    expect(arrow.boundElements).toBeNull()
    expect(errorCode(() => deleteCanvasFiles(scene(), ['file-a']))).toBe('CONFLICT')

    const withoutImage = deleteCanvasElements(scene(), ['image-c'])
    expect(deleteCanvasFiles(withoutImage, ['file-a']).files).toEqual({})
  })

  it('upserts files and rejects element identity changes', () => {
    const withFile = upsertCanvasFiles(scene(), {
      'file-b': {
        id: 'file-b', mimeType: 'image/jpeg', dataURL: 'data:image/jpeg;base64,AA==',
        created: 2, futureFile: true,
      },
    })
    expect(withFile.files['file-b'].futureFile).toBe(true)
    expect(errorCode(() => patchCanvasElements(scene(), [
      { id: 'shape-a', changes: { id: 'other' } },
    ]))).toBe('CONFLICT')
  })

  it('supports explicit placement, filtered search, metadata updates, and atomic reference checks', () => {
    let value = insertCanvasElements(scene(), [element('label-d', 'text', {
      text: 'Needle needle', originalText: 'Needle needle',
      frameId: 'shape-a', groupIds: ['g1'], version: 2,
    })], undefined, { beforeElementId: 'arrow-b' })
    expect(value.elements.map((element) => element.id)).toEqual(['shape-a', 'label-d', 'arrow-b', 'image-c'])
    expect(searchCanvasElements(value, 'needle', { frameId: 'shape-a', groupId: 'g1' })).toMatchObject({
      totalMatchCount: 2, matchedElementCount: 1, hits: [{ zIndex: 1 }],
    })
    value = updateCanvasScene(value, {
      elementUpdates: [{ elementId: 'label-d', set: { strokeColor: '#abc' } }],
      elementOrder: ['image-c', 'shape-a', 'arrow-b', 'label-d'],
      appState: { set: { theme: 'dark' } },
    })
    expect(value.elements[3]).toMatchObject({ id: 'label-d', text: 'Needle needle', version: 3, strokeColor: '#abc' })
    expect(value.elements[3].versionNonce).toEqual(expect.any(Number))
    expect(value.elements[3].updated).toEqual(expect.any(Number))
    expect(value.appState).toMatchObject({ futureState: 'kept', theme: 'dark' })

    expect(errorCode(() => deleteCanvasElementsStrict(value, ['shape-a']))).toBe('NOT_FOUND')
    expect(value.elements.some((element) => element.id === 'shape-a')).toBe(true)
  })
})

describe('MindElixir native operations', () => {
  it('inserts, patches, moves, and deletes nodes while preserving unknown fields', () => {
    let value = insertMindMapNode(mindMap(), 'a', 1, { id: 'a-2', topic: 'A2', future: 1 })
    value = patchMindMapNode(value, { id: 'a-2', changes: { topic: 'Updated' } })
    value = moveMindMapNode(value, 'a-2', 'b', 0)
    expect(value.nodeData.children?.[1].children?.[0]).toMatchObject({
      id: 'a-2', topic: 'Updated', future: 1,
    })
    expect(value.nodeData.futureNode).toEqual({ kept: true })
    value = deleteMindMapNode(value, 'a-2')
    expect(value.nodeData.children?.[1].children).toEqual([])
  })

  it('rejects duplicate IDs, cycles, root deletion, and structural patches', () => {
    expect(errorCode(() => insertMindMapNode(mindMap(), 'b', 0, {
      id: 'a', topic: 'duplicate',
    }))).toBe('CONFLICT')
    expect(errorCode(() => moveMindMapNode(mindMap(), 'a', 'a-1', 0))).toBe('CONFLICT')
    expect(errorCode(() => deleteMindMapNode(mindMap(), 'root'))).toBe('CONFLICT')
    expect(errorCode(() => patchMindMapNode(mindMap(), {
      id: 'a', changes: { children: [] },
    }))).toBe('CONFLICT')
  })

  it('supports native batch search/update/move and rejects overlapping deletes atomically', () => {
    let value = insertMindMapNodes(mindMap(), 'b', 0, [
      { id: 'b-1', topic: 'Needle', style: { color: 'red' } },
      { id: 'b-2', topic: 'Other', tags: ['needle', 'needle'] },
    ])
    expect(searchMindMapNodes(value, 'needle', { fields: ['tags'], limit: 1 })).toMatchObject({
      totalMatchCount: 3, matchedNodeCount: 2, truncated: true,
    })
    value = updateMindMapNodes(value, [{ nodeId: 'b-1', set: { topic: 'Updated' }, unset: ['style'] }])
    expect(value.nodeData.children?.[1].children?.[0]).toEqual({ id: 'b-1', topic: 'Updated' })
    value = moveMindMapNodes(value, [{ nodeId: 'b-2', parentNodeId: 'a', index: 0 }])
    expect(value.nodeData.children?.[0].children?.[0].id).toBe('b-2')

    expect(errorCode(() => deleteMindMapNodes(value, ['a', 'b-2']))).toBe('INVALID_INPUT')
    expect(value.nodeData.children?.[0].children?.[0].id).toBe('b-2')
    expect(errorCode(() => moveMindMapNodes(value, [
      { nodeId: 'b-1', parentNodeId: 'root' }, { nodeId: 'a', parentNodeId: 'a-1' },
    ]))).toBe('CONFLICT')
    expect(value.nodeData.children?.[1].children?.[0].id).toBe('b-1')
  })
})
