export type PendingSaveFlusher = () => Promise<void>

interface PendingSaveController {
  flush: PendingSaveFlusher
  hasPending: () => boolean
  discard: () => void
}

const controllers = new Set<PendingSaveController>()

export function registerPendingSaveFlusher(
  flush: PendingSaveFlusher,
  hasPending: () => boolean = () => true,
  discard: () => void = () => undefined,
): () => void {
  const controller = { flush, hasPending, discard }
  controllers.add(controller)
  return () => controllers.delete(controller)
}

export async function flushPendingSaves(): Promise<void> {
  await Promise.all([...controllers].map(({ flush }) => flush()))
}

export function hasPendingSaves(): boolean {
  return [...controllers].some(({ hasPending }) => hasPending())
}

export function discardPendingSaves(): void {
  controllers.forEach(({ discard }) => discard())
}

export function pendingSaveCount(): number {
  return [...controllers].filter(({ hasPending }) => hasPending()).length
}
