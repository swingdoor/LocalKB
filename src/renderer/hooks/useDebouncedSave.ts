import { useCallback, useEffect, useRef } from 'react'
import type { Document } from '@shared/types'

interface UseDebouncedSaveOptions {
  contentDelay?: number
  titleDelay?: number
}

export function useDebouncedSave(
  onUpdate: (data: Partial<Document>) => void,
  options: UseDebouncedSaveOptions = {}
) {
  const { contentDelay = 1000, titleDelay = 500 } = options
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const onUpdateRef = useRef(onUpdate)

  // 保持 onUpdate 引用最新
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  /**
   * 防抖保存内容
   */
  const saveContent = useCallback((content: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      onUpdateRef.current({ content })
    }, contentDelay)
  }, [contentDelay])

  /**
   * 防抖保存标题
   */
  const saveTitle = useCallback((title: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      onUpdateRef.current({ title })
    }, titleDelay)
  }, [titleDelay])

  /**
   * 立即清除待执行的保存任务
   */
  const cancelPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
  }, [])

  return {
    saveContent,
    saveTitle,
    cancelPendingSave,
  }
}
