import { useCallback, useEffect, useRef, useState } from 'react'
import type { Operation } from 'mind-elixir'
import type { MindMapData } from '@shared/knowledge-types'

export type MindMapEditorPhase = 'closed' | 'loading' | 'ready-clean' | 'ready-dirty' | 'saving' | 'error'

const AUTOSAVE_DELAY_MS = 500

export function isPersistentMindMapOperation(operation: Pick<Operation, 'name'>): boolean {
  return operation.name !== 'beginEdit'
}

export function useMindMapSaveCoordinator({
  isOpen,
  getData,
  onSave,
  onClose,
  onError,
}: {
  isOpen: boolean
  getData: () => MindMapData | null
  onSave: (data: MindMapData) => Promise<void>
  onClose: () => void
  onError: (message: string | null) => void
}) {
  const [phase, setPhaseState] = useState<MindMapEditorPhase>('closed')
  const [dirtyVersion, setDirtyVersion] = useState(0)
  const phaseRef = useRef<MindMapEditorPhase>('closed')
  const mutationVersionRef = useRef(0)
  const failedSaveVersionRef = useRef<number | null>(null)
  const closeAfterSaveRef = useRef(false)
  const actionDepthRef = useRef(0)
  const actionChangedRef = useRef(false)
  const sessionRef = useRef(0)

  const transition = useCallback((next: MindMapEditorPhase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const commitMutation = useCallback(() => {
    mutationVersionRef.current += 1
    failedSaveVersionRef.current = null
    setDirtyVersion(mutationVersionRef.current)
    if (phaseRef.current === 'ready-clean') transition('ready-dirty')
  }, [transition])

  const recordPersistentMutation = useCallback(() => {
    if (actionDepthRef.current > 0) actionChangedRef.current = true
    else commitMutation()
  }, [commitMutation])

  const recordOperation = useCallback((operation: Pick<Operation, 'name'>) => {
    if (isPersistentMindMapOperation(operation)) recordPersistentMutation()
  }, [recordPersistentMutation])

  const runApplicationAction = useCallback(async <T,>(action: () => T | Promise<T>): Promise<T> => {
    actionDepthRef.current += 1
    try {
      return await action()
    } finally {
      actionDepthRef.current -= 1
      if (actionDepthRef.current === 0 && actionChangedRef.current) {
        actionChangedRef.current = false
        commitMutation()
      }
    }
  }, [commitMutation])

  const reset = useCallback(() => {
    sessionRef.current += 1
    mutationVersionRef.current = 0
    failedSaveVersionRef.current = null
    closeAfterSaveRef.current = false
    actionDepthRef.current = 0
    actionChangedRef.current = false
    setDirtyVersion(0)
    onError(null)
    transition('loading')
  }, [onError, transition])

  const ready = useCallback(() => transition('ready-clean'), [transition])
  const failLoad = useCallback((message: string) => {
    onError(message)
    transition('error')
  }, [onError, transition])

  const save = useCallback(async () => {
    if (phaseRef.current !== 'ready-dirty') return false
    const data = getData()
    if (!data) return false
    const session = sessionRef.current
    const savingVersion = mutationVersionRef.current
    transition('saving')
    onError(null)
    try {
      await onSave(data)
      if (session !== sessionRef.current) return false
      failedSaveVersionRef.current = null
      const isLatest = mutationVersionRef.current === savingVersion
      if (isLatest && closeAfterSaveRef.current) {
        closeAfterSaveRef.current = false
        onClose()
        return true
      }
      transition(isLatest ? 'ready-clean' : 'ready-dirty')
      return true
    } catch (cause) {
      if (session !== sessionRef.current) return false
      const message = cause instanceof Error ? cause.message : '保存思维导图失败'
      failedSaveVersionRef.current = savingVersion
      closeAfterSaveRef.current = false
      onError(message)
      transition('ready-dirty')
      throw cause
    }
  }, [getData, onClose, onError, onSave, transition])

  useEffect(() => {
    if (phase !== 'ready-dirty' || failedSaveVersionRef.current === dirtyVersion) return
    const timer = window.setTimeout(() => { void save().catch(() => undefined) }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirtyVersion, phase, save])

  useEffect(() => {
    if (isOpen) return
    sessionRef.current += 1
    phaseRef.current = 'closed'
    setPhaseState('closed')
  }, [isOpen])

  const requestClose = useCallback(() => {
    if (phaseRef.current === 'saving') {
      closeAfterSaveRef.current = true
      return
    }
    if (phaseRef.current === 'ready-dirty') {
      closeAfterSaveRef.current = true
      void save().catch(() => undefined)
      return
    }
    onClose()
  }, [onClose, save])

  return {
    phase,
    dirtyVersion,
    reset,
    ready,
    failLoad,
    save,
    requestClose,
    recordOperation,
    recordPersistentMutation,
    runApplicationAction,
  }
}
