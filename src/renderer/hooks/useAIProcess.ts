import { useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { looksLikeMarkdown, markdownToHtml, sanitizePastedHtml } from '../utils/richPaste'

export type AIMode = 'polish' | 'expand'

interface PolishState {
  originalText: string
  polishedText: string
  isLoading: boolean
  error?: string
  selectionRange?: { from: number; to: number }
}

const initialPolishState: PolishState = {
  originalText: '',
  polishedText: '',
  isLoading: false,
}

/**
 * 判断文本是否包含 Markdown 标记（含单行内联标记）
 * looksLikeMarkdown 要求多行，这里补充单行场景（润色常返回单行带 **粗体** 的文本）
 */
function containsMarkdown(text: string): boolean {
  if (looksLikeMarkdown(text)) return true
  // 单行内联标记：粗体/斜体、行内代码、链接、行首标题/列表
  return /(\*\*|__)[^\n*_]+(\*\*|__)/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /^#{1,6}\s+\S/.test(text.trim()) ||
    /^\s*[-*+]\s+\S/.test(text.trim())
}

export function useAIProcess() {
  const [showPolishModal, setShowPolishModal] = useState(false)
  const [aiMode, setAiMode] = useState<AIMode>('polish')
  const [polishState, setPolishState] = useState<PolishState>(initialPolishState)

  /**
   * 统一的 AI 处理函数（润色/扩写）
   */
  const handleAIProcess = useCallback(async (
    text: string,
    mode: AIMode,
    editor: Editor
  ): Promise<void> => {
    // 保存选区范围
    const { from, to } = editor.state.selection

    setAiMode(mode)
    setPolishState({
      originalText: text,
      polishedText: '',
      isLoading: true,
      selectionRange: { from, to },
    })
    setShowPolishModal(true)

    try {
      // 根据模式调用不同的 AI 接口
      const result = mode === 'polish'
        ? await window.electronAPI.ai.polish(text)
        : await window.electronAPI.ai.expand(text)

      if (result.success && result.text) {
        setPolishState(prev => ({
          ...prev,
          polishedText: result.text!,
          isLoading: false,
        }))
      } else {
        const errorMsg = mode === 'polish' ? '润色失败' : '扩写失败'
        setPolishState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || errorMsg,
        }))
      }
    } catch (err: any) {
      const errorMsg = mode === 'polish' ? '润色请求失败' : '扩写请求失败'
      setPolishState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || errorMsg,
      }))
    }
  }, [])

  /**
   * 确认替换 AI 处理结果
   * AI 输出通常为 Markdown 格式，转换为富文本后插入，避免出现 ** # 等原始标记
   */
  const confirmPolish = useCallback((editor: Editor) => {
    if (!polishState.selectionRange || !polishState.polishedText) return

    const { from, to } = polishState.selectionRange
    const text = polishState.polishedText

    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .deleteSelection()

    // 若内容包含 Markdown 标记，转为 HTML 插入；否则按纯文本插入
    if (containsMarkdown(text)) {
      const html = sanitizePastedHtml(markdownToHtml(text))
      chain.insertContent(html).run()
    } else {
      chain.insertContent(text).run()
    }

    setShowPolishModal(false)
    setPolishState(initialPolishState)
  }, [polishState.selectionRange, polishState.polishedText])

  /**
   * 取消 AI 处理
   */
  const cancelPolish = useCallback(() => {
    setShowPolishModal(false)
    setPolishState(initialPolishState)
  }, [])

  return {
    showPolishModal,
    aiMode,
    polishState,
    handleAIProcess,
    confirmPolish,
    cancelPolish,
  }
}
