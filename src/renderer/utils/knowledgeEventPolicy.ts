import type { KnowledgeChangeEvent } from '@shared/knowledge-types'

export function isExternalEventForVault(
  event: KnowledgeChangeEvent,
  vaultId: string | undefined,
): boolean {
  return event.origin !== 'renderer' && event.vaultId === vaultId
}

export function shouldReloadExternalChange(
  hasPending: boolean,
  confirmReload: () => boolean,
): boolean {
  return !hasPending || confirmReload()
}
