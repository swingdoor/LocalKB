import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExcalidrawScene, TipTapDocument } from '../../shared/knowledge-types'
import { FileKnowledgeStore, type FileSystemApi } from './file-knowledge-store'
import { VaultMigrator } from './vault-migrator'
import { migrateLegacyVaultsAtStartup } from './startup-migration'

const VAULT_ID = '11111111-1111-4111-8111-111111111111'
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DRAWING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GROUP_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const legacyScene = {
  elements: [],
  appState: { viewBackgroundColor: '#fff', future: true },
  files: {},
}

function encodeCanvas(value: unknown): string {
  return Buffer.from(encodeURIComponent(JSON.stringify(value)), 'utf8').toString('base64')
}

async function writeLegacyFixture(root: string): Promise<{ store: FileKnowledgeStore; localImage: string }> {
  const store = new FileKnowledgeStore(root)
  const vaultPath = store.paths.vault(VAULT_ID)
  const documentsPath = path.join(vaultPath, 'documents')
  await fs.mkdir(documentsPath, { recursive: true })
  await fs.writeFile(path.join(vaultPath, 'meta.json'), JSON.stringify({
    vault: { id: VAULT_ID, name: 'Legacy vault', createdAt: '2025-01-01T00:00:00.000Z' },
    documents: [DOC_ID, DRAWING_ID],
  }))
  await fs.writeFile(path.join(vaultPath, 'structure.json'), JSON.stringify({
    version: 1,
    entries: [
      { kind: 'group', id: GROUP_ID, name: 'Folder', parentId: null, order: 0 },
      { kind: 'document', id: DOC_ID, parentId: GROUP_ID, order: 0 },
      { kind: 'document', id: DRAWING_ID, parentId: null, order: 1 },
    ],
  }))

  const localImage = path.join(root, 'selected-local.png')
  await fs.writeFile(localImage, Buffer.from([9, 8, 7]))
  const mindMapData = {
    svg: 'data:image/svg+xml;base64,PHN2Zy8+',
    data: { nodeData: { id: 'root', topic: 'Root' }, direction: 2 },
  }
  const tipTap: TipTapDocument = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello migration' }] },
      {
        type: 'image',
        attrs: {
          src: 'data:image/svg+xml;base64,PHN2Zy8+',
          alt: 'canvas-legacy',
          title: encodeCanvas(legacyScene),
          width: 500,
          textAlign: 'center',
        },
      },
      { type: 'mindmap' as never, attrs: { alt: 'mindmap-old', data: JSON.stringify(mindMapData) } },
      { type: 'image', attrs: { src: 'data:image/png;base64,AQID', width: 120 } },
      { type: 'image', attrs: { src: localImage } },
      { type: 'image', attrs: { src: 'https://example.test/image.png' } },
      {
        type: 'image',
        attrs: { src: 'data:image/svg+xml;base64,PHN2Zy8+', alt: 'canvas-broken', title: 'bad' },
      },
    ],
  }
  await fs.writeFile(path.join(documentsPath, `${DOC_ID}.json`), JSON.stringify({
    id: DOC_ID,
    title: 'Text document',
    content: JSON.stringify(tipTap),
    type: 'document',
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-02T00:00:00.000Z',
  }))
  await fs.writeFile(path.join(documentsPath, `${DRAWING_ID}.json`), JSON.stringify({
    id: DRAWING_ID,
    title: 'Drawing',
    content: JSON.stringify(legacyScene),
    type: 'drawing',
    createdAt: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-03-02T00:00:00.000Z',
  }))
  return { store, localImage }
}

describe('VaultMigrator', () => {
  let root: string
  let store: FileKnowledgeStore
  let migrator: VaultMigrator

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-migration-'))
    ;({ store } = await writeLegacyFixture(root))
    migrator = new VaultMigrator(store)
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('inventories nested strings, native resources, images, bytes, and warnings read-only', async () => {
    const before = await fs.readFile(store.paths.legacyMeta(VAULT_ID), 'utf8')
    const report = await migrator.dryRun(VAULT_ID)
    expect(report).toMatchObject({
      sourceVersion: 1,
      topLevelDocuments: 1,
      topLevelCanvases: 1,
      groups: 1,
      embeddedCanvases: 1,
      embeddedMindMaps: 1,
      ownedAssets: 2,
      remoteImages: 1,
      preservedLegacyNodes: 1,
      canMigrate: true,
    })
    expect(report.totalBytes).toBeGreaterThan(0)
    expect(report.ownedAssetBytes).toBe(6)
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'UNRECOGNIZED_EMBEDDED_CANVAS', documentId: DOC_ID,
    }))
    expect(JSON.stringify(report)).not.toContain('hello migration')
    expect(JSON.stringify(report)).not.toContain(root)
    expect(await fs.readFile(store.paths.legacyMeta(VAULT_ID), 'utf8')).toBe(before)
    expect(await store.exists(store.paths.migrationStage(VAULT_ID))).toBe(false)
  })

  it('builds and validates a native staging vault with deterministic retry output', async () => {
    await migrator.stage(VAULT_ID)
    const staging = new FileKnowledgeStore(store.paths.stagingRoot)
    const firstDocument = await staging.readDocument(VAULT_ID, DOC_ID)
    const tree = await staging.readTree(VAULT_ID)
    const drawing = await staging.readCanvas(VAULT_ID, DRAWING_ID)

    expect(tree.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'group', id: GROUP_ID }),
      expect.objectContaining({ kind: 'content', id: DOC_ID, contentType: 'document' }),
      expect.objectContaining({ kind: 'content', id: DRAWING_ID, contentType: 'canvas' }),
    ]))
    expect(drawing).toMatchObject({
      type: 'excalidraw', version: 2, source: 'localkb-migrated',
    })
    expect(firstDocument.content?.every((node) => (
      node.type === 'text' || node.attrs?.nodeId !== undefined
    ))).toBe(true)
    const canvasReference = firstDocument.content?.find((node) => node.type === 'canvasReference')
    const mindMapReference = firstDocument.content?.find((node) => node.type === 'mindmapReference')
    const assetReferences = firstDocument.content?.filter((node) => node.type === 'assetImage') ?? []
    expect(canvasReference?.attrs).toMatchObject({ width: 500, textAlign: 'center' })
    expect(canvasReference?.attrs?.title).toBeUndefined()
    expect(mindMapReference?.attrs?.data).toBeUndefined()
    expect(assetReferences).toHaveLength(2)
    await migrator.validateStage(VAULT_ID, (await migrator.dryRun(VAULT_ID)))
    expect(await store.completedMigrationStage(VAULT_ID)).toBe(true)

    await migrator.stage(VAULT_ID)
    expect(await staging.readDocument(VAULT_ID, DOC_ID)).toEqual(firstDocument)
  })

  it('migrates a flat vault when no legacy structure file exists', async () => {
    await fs.rm(path.join(store.paths.vault(VAULT_ID), 'structure.json'))
    const report = await migrator.dryRun(VAULT_ID)
    expect(report.groups).toBe(0)
    expect(report.canMigrate).toBe(true)
    await migrator.stage(VAULT_ID)
    const tree = await new FileKnowledgeStore(store.paths.stagingRoot).readTree(VAULT_ID)
    expect(tree.entries).toHaveLength(2)
    expect(tree.entries.every((entry) => entry.parentId === null)).toBe(true)
  })

  it('rejects malformed top-level content before staging', async () => {
    const target = path.join(store.paths.documents(VAULT_ID), `${DRAWING_ID}.json`)
    const legacy = JSON.parse(await fs.readFile(target, 'utf8'))
    legacy.content = '{broken'
    await fs.writeFile(target, JSON.stringify(legacy))

    const report = await migrator.dryRun(VAULT_ID)
    expect(report.canMigrate).toBe(false)
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'INVALID_TOP_LEVEL_CANVAS', documentId: DRAWING_ID,
    }))
    await expect(migrator.stage(VAULT_ID)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' })
    expect(await store.exists(store.paths.migrationStage(VAULT_ID))).toBe(false)
  })

  it('activates by retaining the complete v1 backup', async () => {
    await migrator.stage(VAULT_ID)
    const result = await migrator.activate(VAULT_ID)
    expect(await store.exists(store.paths.vaultMeta(VAULT_ID))).toBe(true)
    expect(await store.exists(path.join(result.backupPath, 'meta.json'))).toBe(true)
    expect(await store.exists(path.join(result.activePath, '.migration-complete.json'))).toBe(false)
    expect(await store.readVault(VAULT_ID)).toMatchObject({ id: VAULT_ID, schemaVersion: 2 })
  })

  it('restores v1 when the stage-to-active swap fails', async () => {
    await migrator.stage(VAULT_ID)
    const activePath = store.paths.vault(VAULT_ID)
    const stagePath = store.paths.migrationStage(VAULT_ID)
    const failingFs = {
      ...(fs as unknown as FileSystemApi),
      rename: async (source: string, target: string) => {
        if (source === stagePath && target === activePath) throw new Error('injected swap failure')
        await fs.rename(source, target)
      },
    } as FileSystemApi
    const failingMigrator = new VaultMigrator(store, failingFs)
    await expect(failingMigrator.activate(VAULT_ID)).rejects.toMatchObject({
      code: 'MIGRATION_FAILED',
    })
    expect(await store.exists(store.paths.legacyMeta(VAULT_ID))).toBe(true)
    expect(await store.exists(store.paths.vaultMeta(VAULT_ID))).toBe(false)
    expect(await store.exists(stagePath)).toBe(true)
  })

  it('preserves serializer-supported unknown native canvas fields', async () => {
    await migrator.stage(VAULT_ID)
    const staging = new FileKnowledgeStore(store.paths.stagingRoot)
    const value = await staging.readCanvas(VAULT_ID, DRAWING_ID) as ExcalidrawScene
    expect(value.appState.future).toBe(true)
  })

  it('performs the one-time startup cutover and keeps the backup', async () => {
    const migrations = await migrateLegacyVaultsAtStartup(store)
    expect(migrations).toHaveLength(1)
    expect(await store.exists(store.paths.vaultMeta(VAULT_ID))).toBe(true)
    expect(await store.exists(path.join(migrations[0].backupPath, 'meta.json'))).toBe(true)
    expect(await migrateLegacyVaultsAtStartup(store)).toEqual([])
  })
})
