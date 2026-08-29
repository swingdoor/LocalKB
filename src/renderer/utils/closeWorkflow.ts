export interface CloseWorkflowOptions {
  flush: () => Promise<void>
  discard: () => void
  confirmRetry: () => boolean | Promise<boolean>
  confirmDiscard: () => boolean | Promise<boolean>
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
      if (await options.confirmRetry()) continue
      if (!await options.confirmDiscard()) return 'cancelled'
      options.discard()
      options.complete()
      return 'closed'
    }
  }
}
