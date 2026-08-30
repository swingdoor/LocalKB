import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VAULT_FORMAT_VERSIONS } from '../../shared/knowledge-types'
import type {
  ContentEntryV3,
  ExcalidrawScene,
  MindMapData,
  TipTapDocument,
  VaultTreeV3,
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
const MINDMAP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const document: TipTapDocument = {
  type: 'doc', content: [{
    type: 'paragraph', attrs: { nodeId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    content: [{ type: 'text', text: 'hello' }],
  }],
}
const canvas: ExcalidrawScene = {
  type: 'excalidraw', version: 2, source: 'localkb-test',
  elements: [], appState: { future: true }, files: {},
}
const mindMap: MindMapData = { nodeData: { id: 'root', topic: 'Root' }, future: true }

function contentEntry(
  id = DOC_ID,
  contentType: 'document' | 'canvas' | 'mindmap' = 'document',
  overrides: Partial<ContentEntryV3> = {},
): ContentEntryV3 {
  return {
    kind: 'content', id, contentType, title: 'Entry', parentId: null, order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('FileKnowledgeStore V3', () => {
  let root: string
  let store: FileKnowledgeStore

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-v3-store-'))
    store = new FileKnowledgeStore(root)
    await store.ensureLayout()
    await store.writeVault({
      schemaVersion: 3, formatVersions: { ...VAULT_FORMAT_VERSIONS }, id: VAULT_ID,
      name: 'Test vault', createdAt: '2026-01-01T00:00:00.000Z',
    })
    await store.writeTree(VAULT_ID, { schemaVersion: 3, entries: [] })
    await store.initializeAssetManifest(VAULT_ID)
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('resolves flat POSIX and Windows paths without traversal', () => {
    expect(isPathInside('/vaults/a', '/vaults/a/file', path.posix)).toBe(true)
    expect(isPathInside('/vaults/a', '/vaults/ab/file', path.posix)).toBe(false)
    expect(isPathInside('C:\\vaults\\a', 'C:\\vaults\\a\\file', path.win32)).toBe(true)
    expect(isPathInside('C:\\vaults\\a', 'C:\\vaults\\ab\\file', path.win32)).toBe(false)
    const paths = new KnowledgePaths(root)
    expect(paths.documentFile(VAULT_ID, DOC_ID)).toBe(path.join(root, 'vaults', VAULT_ID, 'documents', `${DOC_ID}.json`))
    expect(paths.mindMapFile(VAULT_ID, MINDMAP_ID)).toBe(path.join(root, 'vaults', VAULT_ID, 'mindmaps', `${MINDMAP_ID}.json`))
    expect(() => paths.vault('../../outside')).toThrow(KnowledgeValidationError)
    expect(() => paths.assetFile(VAULT_ID, ASSET_ID, '../png')).toThrow(KnowledgeValidationError)
  })

  it('uses the same atomic primitive for JSON and binary cleanup', async () => {
    const failingFs = {
      ...(fs as unknown as FileSystemApi),
      rename: async () => { throw new Error('injected rename failure') },
    } as FileSystemApi
    const failing = new FileKnowledgeStore(path.join(root, 'failure'), failingFs)
    const target = path.join(root, 'failure', 'value.bin')
    await expect(failing.atomicWriteFile(target, new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'PERSISTENCE_ERROR',
    })
    expect((await fs.readdir(path.dirname(target))).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('validates V3 timestamps, mindmaps, cycles, and normalizes sibling order', () => {
    const groupId = '99999999-9999-4999-8999-999999999999'
    const tree = validateAndNormalizeTree({
      schemaVersion: 3,
      entries: [
        { ...contentEntry(), order: 9, future: true },
        { kind: 'group', id: groupId, name: ' Group ', parentId: null, order: 2 },
        { ...contentEntry(MINDMAP_ID, 'mindmap'), order: 2 },
      ],
    })
    expect(tree.entries.map((entry) => entry.order)).toEqual([2, 0, 1])
    expect((tree.entries[0] as ContentEntryV3 & { future: boolean }).future).toBe(true)
    expect(() => validateAndNormalizeTree({ schemaVersion: 2, entries: [] })).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }),
    )
    expect(() => validateAndNormalizeTree({
      schemaVersion: 3,
      entries: [
        { kind: 'group', id: groupId, name: 'G', parentId: DOC_ID, order: 0 },
        { kind: 'group', id: DOC_ID, name: 'H', parentId: groupId, order: 0 },
      ],
    })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
  })

  it('reads and writes flat native roots and authoritative asset metadata', async () => {
    await store.writeDocument(VAULT_ID, DOC_ID, document)
    await store.writeCanvas(VAULT_ID, CANVAS_ID, canvas)
    await store.writeMindMap(VAULT_ID, MINDMAP_ID, mindMap)
    const bytes = new Uint8Array([1, 2, 3])
    const asset = await store.writeAsset(VAULT_ID, ASSET_ID, 'notes.txt', 'text/plain', bytes)
    expect(await fs.stat(store.paths.documentFile(VAULT_ID, DOC_ID))).toBeTruthy()
    expect((await store.readCanvas(VAULT_ID, CANVAS_ID)).appState.future).toBe(true)
    expect((await store.readMindMap(VAULT_ID, MINDMAP_ID)).future).toBe(true)
    expect([...((await store.readAsset(VAULT_ID, ASSET_ID)).bytes)]).toEqual([1, 2, 3])
    expect(asset.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect((await store.readAssetManifest(VAULT_ID)).assets[ASSET_ID]).toMatchObject({
      fileName: 'notes.txt', mimeType: 'text/plain', size: 3,
    })
  })

  it('rejects cross-type resource ID conflicts', async () => {
    await store.writeDocument(VAULT_ID, DOC_ID, document)
    await expect(store.writeCanvas(VAULT_ID, DOC_ID, canvas))
      .rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('uses persisted tree timestamps instead of file mtime', async () => {
    await store.writeDocument(VAULT_ID, DOC_ID, document)
    await store.setMtime(store.paths.documentFile(VAULT_ID, DOC_ID), '2030-01-01T00:00:00.000Z')
    const entry = contentEntry()
    expect((await store.contentSummary(VAULT_ID, entry)).updatedAt).toBe(entry.updatedAt)
  })

  it('recovers staged creates and deletes according to the committed V3 tree', async () => {
    await store.stageNewDocument(VAULT_ID, DOC_ID, document)
    await store.stageNewDocument(VAULT_ID, DOC_B, document)
    const tree: VaultTreeV3 = { schemaVersion: 3, entries: [contentEntry()] }
    await store.writeTree(VAULT_ID, tree)
    await store.reconcileVaultOperations(VAULT_ID)
    expect(await store.exists(store.paths.documentFile(VAULT_ID, DOC_ID))).toBe(true)
    expect(await store.exists(store.paths.operationItem(VAULT_ID, 'staging', 'document', DOC_B))).toBe(false)

    await store.stageContentDeletion(VAULT_ID, 'document', DOC_ID)
    await store.reconcileVaultOperations(VAULT_ID)
    expect(await store.exists(store.paths.documentFile(VAULT_ID, DOC_ID))).toBe(true)
  })

  it('promotes only completed V3 stages and uses v2 backup names', async () => {
    await fs.rm(store.paths.vault(VAULT_ID), { recursive: true, force: true })
    const stageStore = new FileKnowledgeStore(store.paths.stagingRoot)
    await stageStore.writeVault({
      schemaVersion: 3, formatVersions: { ...VAULT_FORMAT_VERSIONS }, id: VAULT_ID,
      name: 'Staged', createdAt: '2026-01-01T00:00:00.000Z',
    })
    await store.atomicWriteJson(store.paths.migrationMarker(VAULT_ID), {
      schemaVersion: 3, vaultId: VAULT_ID,
    })
    await store.reconcileMigration(VAULT_ID)
    expect(await store.exists(store.paths.vault(VAULT_ID))).toBe(true)
    expect(store.paths.backup(VAULT_ID, '20260827T010203')).toContain(`${VAULT_ID}-v2-`)
  })
})
