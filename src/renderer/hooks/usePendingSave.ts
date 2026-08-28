import { useCallback, useEffect, useRef, useState } from 'react'
import { registerPendingSaveFlusher } from '../utils/pendingSaveCoordinator'

export interface PendingSaveState {
  pending: boolean
  saving: boolean
  error: Error | null
}

export function usePendingSave<P extends object>(
  save: (patch: P) => Promise<unknown>,
  delay = 700,
) {
  const saveRef = useRef(save)
  const patchRef = useRef<Partial<P> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const [state, setState] = useState<PendingSaveState>({
    pending: false, saving: false, error: null,
  })

  useEffect(() => { saveRef.current = save }, [save])

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (inFlightRef.current) await inFlightRef.current
    const pending = patchRef.current
    if (!pending) return
    patchRef.current = null
    setState({ pending: false, saving: true, error: null })
    const operation = (async () => {
      try {
        await saveRef.current(pending as P)
        setState((current) => ({ ...current, saving: false, error: null }))
      } catch (error) {
        patchRef.current = { ...pending, ...(patchRef.current ?? {}) }
        const normalized = error instanceof Error ? error : new Error('保存失败')
        setState({ pending: true, saving: false, error: normalized })
        throw normalized
      } finally {
        inFlightRef.current = null
      }
    })()
    inFlightRef.current = operation
    await operation
    if (patchRef.current) await flush()
  }, [])

  const schedule = useCallback((patch: Partial<P>) => {
    patchRef.current = { ...(patchRef.current ?? {}), ...patch }
    setState((current) => ({ ...current, pending: true, error: null }))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush().catch(() => undefined) }, delay)
  }, [delay, flush])

  const retry = useCallback(() => flush(), [flush])

  const discard = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    patchRef.current = null
    setState({ pending: false, saving: false, error: null })
  }, [])

  useEffect(() => registerPendingSaveFlusher(
    flush,
    () => patchRef.current !== null || inFlightRef.current !== null,
    discard,
  ), [discard, flush])
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { schedule, flush, retry, discard, ...state }
}
