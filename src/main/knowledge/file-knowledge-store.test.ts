import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ContentEntryV2,
  ExcalidrawScene,
  TipTapDocument,
  VaultTreeV2,
} from '../../shared/knowledge-types'
import { KnowledgeValidationError } from '../../shared/knowledge-validation'
import {
  FileKnowledgeStore,
  type FileSystemApi,
  isPathInside,
  KnowledgePaths,
  validateAndNormalizeTree,
} from './file-knowledge-store'

const VAULT_ID = '11111111-1111-4111-8111-111111111111'
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CANVAS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ASSET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const tipTap: TipTapDocument = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    attrs: { nodeId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
    content: [{ type: 'text', text: 'hello' }],
  }],
}

const canvas: ExcalidrawScene = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [],
  appState: { future: true },
  files: {},
}

function contentEntry(
  id = DOC_ID,
  contentType: 'document' | 'canvas' = 'document',
  overrides: Partial<ContentEntryV2> = {},
): ContentEntryV2 {
  return {
    kind: 'content',
    id,
    contentType,
    title: 'Entry',
    parentId: null,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    metadataUpdatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
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

describe('FileKnowledgeStore', () => {
  let root: string
  let store: FileKnowledgeStore

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-v2-store-'))
    store = new FileKnowledgeStore(root)
    await store.ensureLayout()
    await store.writeVault({
      schemaVersion: 2,
      id: VAULT_ID,
      name: 'Test vault',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await store.writeTree(VAULT_ID, { schemaVersion: 2, entries: [] })
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('resolves POSIX and Windows paths without prefix confusion or traversal', () => {
    expect(isPathInside('/vaults/a', '/vaults/a/file', path.posix)).toBe(true)
    expect(isPathInside('/vaults/a', '/vaults/ab/file', path.posix)).toBe(false)
    expect(isPathInside('C:\\vaults\\a', 'C:\\vaults\\a\\file', path.win32)).toBe(true)
    expect(isPathInside('C:\\vaults\\a', 'C:\\vaults\\ab\\file', path.win32)).toBe(false)
    expect(() => new KnowledgePaths(root).vault('../../outside')).toThrow(KnowledgeValidationError)
    expect(() => store.paths.assetFile(VAULT_ID, DOC_ID, ASSET_ID, '../png'))
      .toThrow(KnowledgeValidationError)
  })

  it('atomically writes native JSON and removes temporary files on rename failure', async () => {
    const failingFs = {
      ...(fs as unknown as FileSystemApi),
      rename: async () => { throw new Error('injected rename failure') },
    } as FileSystemApi
    const failing = new FileKnowledgeStore(path.join(root, 'failure'), failingFs)
    const target = path.join(root, 'failure', 'value.json')

    await expect(failing.atomicWriteJson(target, { value: 1 })).rejects.toMatchObject({
      code: 'PERSISTENCE_ERROR',
    })
    const names = await fs.readdir(path.dirname(target))
    expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('validates, preserves unknown fields, and normalizes mixed sibling order', async () => {
    const groupId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const tree = validateAndNormalizeTree({
      schemaVersion: 2,
      entries: [
        { ...contentEntry(), order: 9, future: true },
        { kind: 'group', id: groupId, name: ' Group ', parentId: null, order: 2 },
        { ...contentEntry(DOC_B), order: 2 },
      ],
    })
    expect(tree.entries.map((entry) => entry.order)).toEqual([2, 0, 1])
    expect((tree.entries[0] as ContentEntryV2 & { future: boolean }).future).toBe(true)

    expect(errorCode(() => validateAndNormalizeTree({
      schemaVersion: 2,
      entries: [
        { kind: 'group', id: groupId, name: 'G', parentId: DOC_ID, order: 0 },
        { kind: 'group', id: DOC_ID, name: 'H', parentId: groupId, order: 0 },
      ],
    }))).toBe('CONFLICT')
  })

  it('reads and writes all native roots and document-owned binary assets', async () => {
    await store.writeDocument(VAULT_ID, DOC_ID, tipTap)
    await store.writeCanvas(VAULT_ID, CANVAS_ID, canvas)
    await store.writeCanvas(VAULT_ID, CANVAS_ID, canvas, DOC_ID)
    await store.writeMindMap(VAULT_ID, DOC_ID, CANVAS_ID, {
      nodeData: { id: 'root', topic: 'Root' }, future: true,
    })
    await store.writeAsset(VAULT_ID, DOC_ID, ASSET_ID, 'png', new Uint8Array([1, 2, 3]))

    expect((await store.readDocument(VAULT_ID, DOC_ID)).content?.[0].type).toBe('paragraph')
    expect((await store.readCanvas(VAULT_ID, CANVAS_ID)).appState.future).toBe(true)
    expect((await store.readCanvas(VAULT_ID, CANVAS_ID, DOC_ID)).type).toBe('excalidraw')
    expect((await store.readMindMap(VAULT_ID, DOC_ID, CANVAS_ID)).future).toBe(true)
    expect([...await store.readAsset(VAULT_ID, DOC_ID, ASSET_ID)]).toEqual([1, 2, 3])
    await store.deleteAsset(VAULT_ID, DOC_ID, ASSET_ID)
    await expect(store.readAsset(VAULT_ID, DOC_ID, ASSET_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('repairs the block-only paragraph wrapper written by the former MCP contract', async () => {
    await store.atomicWriteJson(store.paths.documentFile(VAULT_ID, DOC_ID), {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { nodeId: '99999999-9999-4999-8999-999999999999' },
        content: [
          { type: 'canvasReference', attrs: { nodeId: DOC_B, canvasId: CANVAS_ID } },
          {
            type: 'paragraph', attrs: { nodeId: DOC_ID },
            content: [{ type: 'text', text: 'architecture' }],
          },
        ],
      }],
    })

    const repaired = await store.readDocument(VAULT_ID, DOC_ID)
    expect(repaired.content?.map((node) => node.type)).toEqual(['canvasReference', 'paragraph'])
    expect(repaired.content?.map((node) => node.attrs?.nodeId)).toEqual([DOC_B, DOC_ID])
  })

  it('repairs only the missing regular-arrow flag emitted by the former MCP contract', async () => {
    const legacyArrow = {
      id: 'arrow-a', type: 'arrow', x: 0, y: 0, width: 100, height: 40, angle: 0,
      strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: 1, version: 1, versionNonce: 2, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false,
      points: [[0, 0], [100, 40]], lastCommittedPoint: null,
      startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: 'arrow',
    }
    await store.atomicWriteJson(store.paths.canvasFile(VAULT_ID, CANVAS_ID), {
      ...canvas, elements: [legacyArrow],
    })

    const repaired = await store.readCanvas(VAULT_ID, CANVAS_ID)
    expect(repaired.elements[0].elbowed).toBe(false)
    await expect(store.writeCanvas(VAULT_ID, CANVAS_ID, {
      ...canvas, elements: [legacyArrow],
    } as ExcalidrawScene)).rejects.toMatchObject({ code: 'CORRUPT_DATA' })
  })

  it('computes summaries from the later metadata or native file timestamp', async () => {
    await store.writeDocument(VAULT_ID, DOC_ID, tipTap)
    await store.setMtime(store.paths.documentFile(VAULT_ID, DOC_ID), '2026-02-01T00:00:00.000Z')
    const entry = contentEntry()
    await store.writeTree(VAULT_ID, { schemaVersion: 2, entries: [entry] })
    expect((await store.contentSummary(VAULT_ID, entry)).updatedAt)
      .toBe('2026-02-01T00:00:00.000Z')

    const metadataNewer = { ...entry, metadataUpdatedAt: '2026-03-01T00:00:00.000Z' }
    expect((await store.contentSummary(VAULT_ID, metadataNewer)).updatedAt)
      .toBe('2026-03-01T00:00:00.000Z')
  })

  it('recovers staged creates and deletes according to the committed tree', async () => {
    await store.stageNewDocument(VAULT_ID, DOC_ID, tipTap)
    await store.stageNewDocument(VAULT_ID, DOC_B, tipTap)
    const tree: VaultTreeV2 = { schemaVersion: 2, entries: [contentEntry()] }
    await store.writeTree(VAULT_ID, tree)
    await store.reconcileVaultOperations(VAULT_ID)
    expect(await store.exists(store.paths.documentFile(VAULT_ID, DOC_ID))).toBe(true)
    expect(await store.exists(store.paths.operationItem(
      VAULT_ID, 'staging', 'document', DOC_B,
    ))).toBe(false)

    await store.stageContentDeletion(VAULT_ID, 'document', DOC_ID)
    await store.reconcileVaultOperations(VAULT_ID)
    expect(await store.exists(store.paths.documentFile(VAULT_ID, DOC_ID))).toBe(true)

    await store.stageContentDeletion(VAULT_ID, 'document', DOC_ID)
    await store.writeTree(VAULT_ID, { schemaVersion: 2, entries: [] })
    await store.reconcileVaultOperations(VAULT_ID)
    expect(await store.exists(store.paths.operationItem(
      VAULT_ID, 'trash', 'document', DOC_ID,
    ))).toBe(false)
  })

  it('promotes only completed migration stages and restores a retained backup', async () => {
    await fs.rm(store.paths.vault(VAULT_ID), { recursive: true, force: true })
    const stage = store.paths.migrationStage(VAULT_ID)
    await fs.mkdir(stage, { recursive: true })
    await store.atomicWriteJson(store.paths.migrationMarker(VAULT_ID), {
      schemaVersion: 2, vaultId: VAULT_ID,
    })
    await store.reconcileMigration(VAULT_ID)
    expect(await store.exists(store.paths.vault(VAULT_ID))).toBe(true)

    await fs.rm(store.paths.vault(VAULT_ID), { recursive: true, force: true })
    const backup = store.paths.backup(VAULT_ID, '20260827T010203')
    await fs.mkdir(backup, { recursive: true })
    await fs.writeFile(path.join(backup, 'meta.json'), '{}')
    await store.reconcileMigration(VAULT_ID)
    expect(await store.exists(path.join(store.paths.vault(VAULT_ID), 'meta.json'))).toBe(true)
    expect(await store.exists(backup)).toBe(false)
  })
})
