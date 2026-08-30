import { KnowledgeValidationError } from '../../shared/knowledge-validation'
import type { JsonValue } from '../../shared/knowledge-types'
import { isPlainObject } from '../../shared/knowledge-validation'
import { FileKnowledgeStore } from './file-knowledge-store'
import { VaultMigrator, type ActivatedMigration } from './vault-migrator'

export async function migrateLegacyVaultsAtStartup(
  store: FileKnowledgeStore,
  onActivated: (migration: ActivatedMigration) => void = () => undefined,
): Promise<ActivatedMigration[]> {
  const migrator = new VaultMigrator(store)
  const activated: ActivatedMigration[] = []
  for (const vaultId of await store.listVaultDirectoryIds()) {
    await store.reconcileMigration(vaultId)
    if (!(await store.exists(store.paths.vaultMeta(vaultId)))) {
      throw new KnowledgeValidationError(
        'UNSUPPORTED_VERSION', `知识库 ${vaultId} 缺少版本化元数据，无法启动`,
      )
    }
    const raw = await store.readJson<JsonValue>(store.paths.vaultMeta(vaultId), '知识库元数据')
    if (isPlainObject(raw) && raw.schemaVersion === 3) continue
    const inventory = await migrator.dryRun(vaultId)
    if (!inventory.canMigrate) {
      throw new KnowledgeValidationError(
        'MIGRATION_FAILED',
        `知识库 ${vaultId} 无法迁移，请检查迁移报告`,
        inventory.issues as unknown as JsonValue,
      )
    }
    await migrator.stage(vaultId)
    const migration = await migrator.activate(vaultId)
    activated.push(migration)
    onActivated(migration)
  }
  return activated
}
