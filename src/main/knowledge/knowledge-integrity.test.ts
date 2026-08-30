import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  V3_CANVAS_FIXTURE,
  V3_FIXTURE_IDS,
  V3_MINDMAP_FIXTURE,
  V3_TREE_FIXTURE,
  V3_VAULT_FIXTURE,
  v3DocumentFixture,
} from '../../test/fixtures/knowledge-v3'
import { inspectVaultIntegrity } from './knowledge-integrity'
import { FileKnowledgeStore } from './file-knowledge-store'

describe('V3 vault integrity inventory', () => {
  let root: string
  let store: FileKnowledgeStore

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-integrity-'))
    store = new FileKnowledgeStore(root)
    await store.writeVault(V3_VAULT_FIXTURE)
    await store.writeTree(V3_FIXTURE_IDS.vault, V3_TREE_FIXTURE)
    await store.initializeAssetManifest(V3_FIXTURE_IDS.vault)
    await store.writeDocument(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.documentA, v3DocumentFixture('1'))
    await store.writeDocument(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.documentB, v3DocumentFixture('2'))
    await store.writeCanvas(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.canvasTop, V3_CANVAS_FIXTURE)
    await store.writeCanvas(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.canvasEmbedded, V3_CANVAS_FIXTURE)
    await store.writeMindMap(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.mindmapTop, V3_MINDMAP_FIXTURE)
    await store.writeMindMap(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.mindmapEmbedded, V3_MINDMAP_FIXTURE)
    await store.writeAsset(
      V3_FIXTURE_IDS.vault,
      V3_FIXTURE_IDS.sharedAsset,
      'shared.bin',
      'application/octet-stream',
      new Uint8Array([1, 2, 3, 4]),
    )
  })

  afterEach(async () => fs.rm(root, { recursive: true, force: true }))

  it('reports a healthy shared-resource vault without leaking note content', async () => {
    const report = await inspectVaultIntegrity(store, V3_FIXTURE_IDS.vault, { fullAssetHash: true })
    expect(report).toMatchObject({
      healthy: true,
      fullAssetHash: true,
      counts: { documents: 2, canvases: 2, mindmaps: 2, assets: 1, unreferencedResources: 0 },
      issues: [],
    })
    expect(JSON.stringify(report)).not.toContain('中心主题')
  })

  it('reports missing references, orphan resources, and interrupted operation state', async () => {
    const missing = '60000000-0000-4000-8000-000000000001'
    await store.writeDocument(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.documentA, {
      type: 'doc', content: [{
        type: 'canvasReference',
        attrs: { nodeId: '70000000-0000-4000-8000-000000000001', canvasId: missing },
      }],
    })
    const orphan = '80000000-0000-4000-8000-000000000001'
    await store.writeCanvas(V3_FIXTURE_IDS.vault, orphan, V3_CANVAS_FIXTURE)
    await fs.mkdir(path.join(store.paths.vault(V3_FIXTURE_IDS.vault), '.operations', 'future-state'), {
      recursive: true,
    })

    const report = await inspectVaultIntegrity(store, V3_FIXTURE_IDS.vault)
    expect(report.healthy).toBe(false)
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_REFERENCE', resourceId: missing }),
      expect.objectContaining({ code: 'UNREFERENCED_RESOURCE', resourceId: orphan }),
      expect.objectContaining({ code: 'INTERRUPTED_OPERATION', relativePath: '.operations/future-state' }),
    ]))
  })

  it('distinguishes size checks from optional full SHA-256 verification', async () => {
    const metadata = await store.readAssetMetadata(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.sharedAsset)
    await fs.writeFile(
      store.paths.assetFile(V3_FIXTURE_IDS.vault, V3_FIXTURE_IDS.sharedAsset, metadata.extension),
      new Uint8Array([4, 3, 2, 1]),
    )
    expect((await inspectVaultIntegrity(store, V3_FIXTURE_IDS.vault)).issues)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ASSET_HASH_MISMATCH' })]))
    expect((await inspectVaultIntegrity(store, V3_FIXTURE_IDS.vault, { fullAssetHash: true })).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ASSET_HASH_MISMATCH' })]))
  })

  it('surfaces unsupported metadata, noncanonical order, and unmanifested bytes', async () => {
    const vaultPath = store.paths.vault(V3_FIXTURE_IDS.vault)
    const unordered = structuredClone(V3_TREE_FIXTURE)
    unordered.entries[1].order = 0
    await fs.writeFile(store.paths.tree(V3_FIXTURE_IDS.vault), JSON.stringify(unordered))
    const unknownAsset = '90000000-0000-4000-8000-000000000001'
    await fs.writeFile(path.join(store.paths.assets(V3_FIXTURE_IDS.vault), `${unknownAsset}.bin`), 'unknown')
    await fs.writeFile(store.paths.vaultMeta(V3_FIXTURE_IDS.vault), JSON.stringify({
      ...V3_VAULT_FIXTURE, schemaVersion: 99,
    }))

    const report = await inspectVaultIntegrity(store, V3_FIXTURE_IDS.vault)
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_VERSION', relativePath: 'vault.json' }),
      expect.objectContaining({ code: 'INVALID_TREE', relativePath: 'tree.json' }),
      expect.objectContaining({ code: 'UNMANIFESTED_ASSET', relativePath: `assets/${unknownAsset}.bin` }),
    ]))
    expect(report.issues.every((item) => !path.isAbsolute(item.relativePath ?? ''))).toBe(true)
    expect(vaultPath).not.toBe('')
  })

  it('surfaces malformed vault metadata without exposing raw file content', async () => {
    await fs.writeFile(store.paths.vaultMeta(V3_FIXTURE_IDS.vault), '{"private note":')
    const report = await inspectVaultIntegrity(store, V3_FIXTURE_IDS.vault)
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_METADATA', relativePath: 'vault.json' }),
    ]))
    expect(JSON.stringify(report)).not.toContain('private note')
  })
})
