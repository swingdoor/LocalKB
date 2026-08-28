export interface CloseWorkflowOptions {
  flush: () => Promise<void>
  discard: () => void
  confirmRetry: () => boolean
  confirmDiscard: () => boolean
  complete: () => void
}

export async function finishPendingSavesBeforeClose(
  options: CloseWorkflowOptions,
): Promise<'closed' | 'cancelled'> {
  while (true) {
    try {
      await options.flush()
      options.complete()
      return 'closed'
    } catch {
      if (options.confirmRetry()) continue
      if (!options.confirmDiscard()) return 'cancelled'
      options.discard()
      options.complete()
      return 'closed'
    }
  }
}
