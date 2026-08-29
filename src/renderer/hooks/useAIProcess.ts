import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { AIProcessMode } from '@shared/types'
import { looksLikeMarkdown, markdownToHtml, sanitizePastedHtml } from '../utils/richPaste'

export type AIMode = AIProcessMode
export type AIProcessPhase = 'idle' | 'instruction' | 'loading' | 'result' | 'error'

interface SelectionRange {
  from: number
  to: number
}

interface AIProcessState {
  originalText: string
  processedText: string
  phase: AIProcessPhase
  error?: string
  selectionRange?: SelectionRange
}

const initialProcessState: AIProcessState = {
  originalText: '',
  processedText: '',
  phase: 'idle',
}

function containsMarkdown(text: string): boolean {
  if (looksLikeMarkdown(text)) return true
  return /(\*\*|__)[^\n*_]+(\*\*|__)/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /^#{1,6}\s+\S/.test(text.trim()) ||
    /^\s*[-*+]\s+\S/.test(text.trim())
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useAIProcess() {
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [mode, setMode] = useState<AIMode>('polish')
  const [processState, setProcessState] = useState<AIProcessState>(initialProcessState)
  const activeRequestIdRef = useRef<string | null>(null)

  const runAIProcess = useCallback(async (
    text: string,
    nextMode: AIMode,
    selectionRange: SelectionRange,
    instruction?: string,
  ): Promise<void> => {
    const previousRequestId = activeRequestIdRef.current
    if (previousRequestId) void window.electronAPI.ai.cancel(previousRequestId)

    const requestId = createRequestId()
    activeRequestIdRef.current = requestId
    setMode(nextMode)
    setProcessState({
      originalText: text,
      processedText: '',
      phase: 'loading',
      selectionRange,
    })
    setShowProcessModal(true)

    try {
      const result = await window.electronAPI.ai.process({
        requestId,
        mode: nextMode,
        text,
        instruction,
      })
      if (activeRequestIdRef.current !== requestId) return
      activeRequestIdRef.current = null
      if (result.success && result.text) {
        setProcessState((previous) => ({
          ...previous,
          processedText: result.text!,
          phase: 'result',
        }))
        return
      }
      setProcessState((previous) => ({
        ...previous,
        phase: 'error',
        error: result.error || 'AI 处理失败',
      }))
    } catch (error: unknown) {
      if (activeRequestIdRef.current !== requestId) return
      activeRequestIdRef.current = null
      setProcessState((previous) => ({
        ...previous,
        phase: 'error',
        error: error instanceof Error ? error.message : 'AI 请求失败',
      }))
    }
  }, [])

  const handleAIProcess = useCallback((
    text: string,
    nextMode: Exclude<AIMode, 'custom'>,
    editor: Editor,
  ) => {
    const { from, to } = editor.state.selection
    return runAIProcess(text, nextMode, { from, to })
  }, [runAIProcess])

  const beginCustomProcess = useCallback((text: string, editor: Editor) => {
    const { from, to } = editor.state.selection
    setMode('custom')
    setProcessState({
      originalText: text,
      processedText: '',
      phase: 'instruction',
      selectionRange: { from, to },
    })
    setShowProcessModal(true)
  }, [])

  const submitCustomProcess = useCallback((instruction: string) => {
    if (!processState.selectionRange || processState.phase !== 'instruction') return Promise.resolve()
    return runAIProcess(
      processState.originalText,
      'custom',
      processState.selectionRange,
      instruction.trim(),
    )
  }, [processState.originalText, processState.phase, processState.selectionRange, runAIProcess])

  const reviseCustomProcess = useCallback(() => {
    if (mode !== 'custom' || processState.phase !== 'result') return
    setProcessState((previous) => ({
      ...previous,
      processedText: '',
      phase: 'instruction',
      error: undefined,
    }))
  }, [mode, processState.phase])

  const confirmProcess = useCallback((editor: Editor) => {
    if (
      processState.phase !== 'result'
      || !processState.selectionRange
      || !processState.processedText
    ) return

    const { from, to } = processState.selectionRange
    const text = processState.processedText
    const chain = editor.chain().focus().setTextSelection({ from, to }).deleteSelection()

    if (containsMarkdown(text)) {
      chain.insertContent(sanitizePastedHtml(markdownToHtml(text))).run()
    } else {
      chain.insertContent(text).run()
    }

    setShowProcessModal(false)
    setProcessState(initialProcessState)
  }, [processState.phase, processState.processedText, processState.selectionRange])

  const cancelProcess = useCallback(() => {
    const requestId = activeRequestIdRef.current
    activeRequestIdRef.current = null
    setShowProcessModal(false)
    setProcessState(initialProcessState)
    if (requestId) void window.electronAPI.ai.cancel(requestId)
  }, [])

  useEffect(() => () => {
    const requestId = activeRequestIdRef.current
    activeRequestIdRef.current = null
    if (requestId) void window.electronAPI.ai.cancel(requestId)
  }, [])

  return {
    showProcessModal,
    mode,
    processState,
    handleAIProcess,
    beginCustomProcess,
    submitCustomProcess,
    reviseCustomProcess,
    confirmProcess,
    cancelProcess,
  }
}
