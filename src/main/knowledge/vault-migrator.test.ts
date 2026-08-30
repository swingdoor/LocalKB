import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExcalidrawScene, TipTapDocument } from '../../shared/knowledge-types'
import { FileKnowledgeStore, type FileSystemApi } from './file-knowledge-store'
import { VaultMigrator } from './vault-migrator'

const VAULT_ID = '11111111-1111-4111-8111-111111111111'
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CANVAS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MINDMAP_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ASSET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const scene: ExcalidrawScene = {
  type: 'excalidraw', version: 2, source: 'v2', elements: [], appState: {}, files: {},
}

async function writeV2Fixture(root: string): Promise<FileKnowledgeStore> {
  const store = new FileKnowledgeStore(root)
  const vault = store.paths.vault(VAULT_ID)
  await fs.mkdir(path.join(vault, 'documents', DOC_ID, 'canvases'), { recursive: true })
  await fs.mkdir(path.join(vault, 'documents', DOC_ID, 'mindmaps'), { recursive: true })
  await fs.mkdir(path.join(vault, 'documents', DOC_ID, 'assets'), { recursive: true })
  await fs.writeFile(path.join(vault, 'vault.json'), JSON.stringify({
    schemaVersion: 2, id: VAULT_ID, name: 'Legacy V2', createdAt: '2026-01-01T00:00:00.000Z',
  }))
  await fs.writeFile(path.join(vault, 'tree.json'), JSON.stringify({
    schemaVersion: 2,
    entries: [{
      kind: 'content', id: DOC_ID, contentType: 'document', title: 'Doc',
      parentId: null, order: 0, createdAt: '2026-01-01T00:00:00.000Z',
      metadataUpdatedAt: '2026-01-02T00:00:00.000Z',
    }],
  }))
  const document: TipTapDocument = {
    type: 'doc', content: [
      { type: 'canvasReference', attrs: { nodeId: '11111111-aaaa-4111-8111-111111111111', canvasId: CANVAS_ID } },
      { type: 'mindmapReference', attrs: { nodeId: '22222222-aaaa-4222-8222-222222222222', mindmapId: MINDMAP_ID } },
      {
        type: 'fileAttachment', attrs: {
          nodeId: '33333333-aaaa-4333-8333-333333333333', assetId: ASSET_ID,
          fileName: 'notes.txt', mimeType: 'text/plain', size: 3,
        },
      },
    ],
  } as TipTapDocument
  await fs.writeFile(path.join(vault, 'documents', DOC_ID, 'document.json'), JSON.stringify(document))
  await fs.writeFile(path.join(vault, 'documents', DOC_ID, 'canvases', `${CANVAS_ID}.json`), JSON.stringify(scene))
  await fs.writeFile(path.join(vault, 'documents', DOC_ID, 'mindmaps', `${MINDMAP_ID}.json`), JSON.stringify({
    nodeData: { id: 'root', topic: 'Root' },
  }))
  await fs.writeFile(path.join(vault, 'documents', DOC_ID, 'assets', `${ASSET_ID}.txt`), new Uint8Array([1, 2, 3]))
  return store
}

describe('VaultMigrator V2 to V3', () => {
  let root: string
  let store: FileKnowledgeStore
  let migrator: VaultMigrator

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-v2-v3-'))
    store = await writeV2Fixture(root)
    migrator = new VaultMigrator(store)
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('preflights and stages flat native resources with canonical attachments', async () => {
    const inventory = await migrator.dryRun(VAULT_ID)
    expect(inventory).toMatchObject({
      sourceVersion: 2, canMigrate: true, documents: 1, canvases: 1, mindMaps: 1, assets: 1,
    })
    await migrator.stage(VAULT_ID)
    const staged = new FileKnowledgeStore(store.paths.stagingRoot)
    expect((await staged.readVault(VAULT_ID)).schemaVersion).toBe(3)
    expect(await staged.exists(staged.paths.documentFile(VAULT_ID, DOC_ID))).toBe(true)
    expect(await staged.exists(staged.paths.canvasFile(VAULT_ID, CANVAS_ID))).toBe(true)
    expect(await staged.exists(staged.paths.mindMapFile(VAULT_ID, MINDMAP_ID))).toBe(true)
    expect((await staged.readAssetManifest(VAULT_ID)).assets[ASSET_ID]).toMatchObject({
      fileName: 'notes.txt', size: 3,
    })
    const attachment = (await staged.readDocument(VAULT_ID, DOC_ID)).content?.[2]
    expect(attachment?.attrs).toMatchObject({ assetId: ASSET_ID, displayName: 'notes.txt' })
    expect(attachment?.attrs).not.toHaveProperty('size')
  })

  it('activates with a retained v2 backup and validates rerun state', async () => {
    await migrator.stage(VAULT_ID)
    const activated = await migrator.activate(VAULT_ID)
    expect(path.basename(activated.backupPath)).toContain(`${VAULT_ID}-v2-`)
    expect((await store.readVault(VAULT_ID)).schemaVersion).toBe(3)
    expect((await migrator.dryRun(VAULT_ID)).sourceVersion).toBe(3)
  })

  it('rejects duplicate flattened IDs across resource types', async () => {
    const duplicate = path.join(store.paths.vault(VAULT_ID), 'documents', DOC_ID, 'mindmaps', `${CANVAS_ID}.json`)
    await fs.writeFile(duplicate, JSON.stringify({ nodeData: { id: 'root', topic: 'Duplicate' } }))
    const inventory = await migrator.dryRun(VAULT_ID)
    expect(inventory.canMigrate).toBe(false)
    expect(inventory.issues[0].code).toBe('V2_PREFLIGHT_FAILED')
  })

  it('rejects ambiguous attachment metadata before writing staging data', async () => {
    const target = path.join(store.paths.vault(VAULT_ID), 'documents', DOC_ID, 'document.json')
    const raw = JSON.parse(await fs.readFile(target, 'utf8'))
    raw.content.push({
      type: 'fileAttachment', attrs: {
        nodeId: '44444444-aaaa-4444-8444-444444444444', assetId: ASSET_ID,
        fileName: 'different.txt', mimeType: 'text/plain', size: 3,
      },
    })
    await fs.writeFile(target, JSON.stringify(raw))
    expect((await migrator.dryRun(VAULT_ID)).canMigrate).toBe(false)
    expect(await store.exists(store.paths.migrationStage(VAULT_ID))).toBe(false)
  })

  it('rejects malformed native content and missing resource references during preflight', async () => {
    const documentPath = path.join(store.paths.vault(VAULT_ID), 'documents', DOC_ID, 'document.json')
    await fs.writeFile(documentPath, JSON.stringify({ type: 'paragraph' }))
    expect((await migrator.dryRun(VAULT_ID))).toMatchObject({ canMigrate: false, sourceVersion: 'unknown' })

    await fs.rm(root, { recursive: true, force: true })
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-v2-v3-'))
    store = await writeV2Fixture(root)
    migrator = new VaultMigrator(store)
    await fs.rm(path.join(store.paths.vault(VAULT_ID), 'documents', DOC_ID, 'canvases', `${CANVAS_ID}.json`))
    const missing = await migrator.dryRun(VAULT_ID)
    expect(missing.canMigrate).toBe(false)
    expect(missing.issues[0].message).toContain('引用了不存在的 canvas')
  })

  it('narrowly lifts the legacy empty paragraph wrapper around a task list', async () => {
    const documentPath = path.join(store.paths.vault(VAULT_ID), 'documents', DOC_ID, 'document.json')
    await fs.writeFile(documentPath, JSON.stringify({
      type: 'doc', content: [{
        type: 'paragraph', attrs: { nodeId: '10000000-0000-4000-8000-000000000001' },
        content: [{
          type: 'taskList', attrs: { nodeId: '10000000-0000-4000-8000-000000000002' },
          content: [{
            type: 'taskItem', attrs: {
              nodeId: '10000000-0000-4000-8000-000000000003', checked: false,
            },
            content: [{
              type: 'paragraph', attrs: { nodeId: '10000000-0000-4000-8000-000000000004' },
              content: [{ type: 'text', text: '保留任务内容' }],
            }],
          }],
        }],
      }],
    }))

    const inventory = await migrator.dryRun(VAULT_ID)
    expect(inventory.canMigrate).toBe(true)
    expect(inventory.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'V2_TASK_LIST_WRAPPER_NORMALIZED', resourceId: DOC_ID }),
    ]))
    await migrator.stage(VAULT_ID)
    const staged = new FileKnowledgeStore(store.paths.stagingRoot)
    const migrated = await staged.readDocument(VAULT_ID, DOC_ID)
    expect(migrated.content?.[0]).toMatchObject({
      type: 'taskList', attrs: { nodeId: '10000000-0000-4000-8000-000000000002' },
    })
  })

  it('rebuilds an interrupted stage deterministically on rerun', async () => {
    await migrator.stage(VAULT_ID)
    const stagedDocument = path.join(store.paths.migrationStage(VAULT_ID), 'documents', `${DOC_ID}.json`)
    await fs.writeFile(stagedDocument, '{ interrupted')
    await fs.writeFile(path.join(store.paths.migrationStage(VAULT_ID), 'unexpected.tmp'), 'partial')

    await migrator.stage(VAULT_ID)

    const staged = new FileKnowledgeStore(store.paths.stagingRoot)
    expect((await staged.readDocument(VAULT_ID, DOC_ID)).type).toBe('doc')
    expect(await staged.exists(path.join(store.paths.migrationStage(VAULT_ID), 'unexpected.tmp'))).toBe(false)
    await expect(migrator.validateStage(VAULT_ID)).resolves.toBeUndefined()
  })

  it('detects a same-size staged asset hash mismatch before activation', async () => {
    await migrator.stage(VAULT_ID)
    const staged = new FileKnowledgeStore(store.paths.stagingRoot)
    const metadata = await staged.readAssetMetadata(VAULT_ID, ASSET_ID)
    await fs.writeFile(staged.paths.assetFile(VAULT_ID, ASSET_ID, metadata.extension), new Uint8Array([3, 2, 1]))

    await expect(migrator.validateStage(VAULT_ID)).rejects.toThrow(/哈希不一致/)
    expect((await migrator.dryRun(VAULT_ID)).sourceVersion).toBe(2)
  })

  it('restores the active v2 vault when the stage-to-active rename fails', async () => {
    await migrator.stage(VAULT_ID)
    const stagePath = store.paths.migrationStage(VAULT_ID)
    const failingFs = Object.create(fs) as FileSystemApi
    failingFs.rename = async (source: string, target: string) => {
      if (source === stagePath) throw Object.assign(new Error('injected rename failure'), { code: 'EIO' })
      await fs.rename(source, target)
    }
    const failingMigrator = new VaultMigrator(store, failingFs)

    await expect(failingMigrator.activate(VAULT_ID)).rejects.toThrow(/injected rename failure/)
    const restored = JSON.parse(await fs.readFile(store.paths.vaultMeta(VAULT_ID), 'utf8'))
    expect(restored.schemaVersion).toBe(2)
    expect(await store.exists(stagePath)).toBe(true)
  })

  it('finishes an interrupted swap from a validated stage while retaining the backup', async () => {
    await migrator.stage(VAULT_ID)
    const active = store.paths.vault(VAULT_ID)
    const backup = store.paths.backup(VAULT_ID, 'manual')
    await fs.mkdir(path.dirname(backup), { recursive: true })
    await fs.rename(active, backup)

    await store.reconcileMigration(VAULT_ID)

    expect((await store.readVault(VAULT_ID)).schemaVersion).toBe(3)
    expect(await store.exists(backup)).toBe(true)
    expect(await store.exists(store.paths.migrationMarker(VAULT_ID))).toBe(false)
  })
})
