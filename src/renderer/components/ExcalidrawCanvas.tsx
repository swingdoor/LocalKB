import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import type { Document } from '../App'

// 懒加载 Excalidraw
const Excalidraw = lazy(async () => {
  const module = await import('@excalidraw/excalidraw')
  return { default: module.Excalidraw }
})

interface ExcalidrawCanvasProps {
  document: Document
  onUpdate: (data: { title?: string; content?: string }) => void
}

// 错误边界组件
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Excalidraw Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

function ExcalidrawCanvas({ document, onUpdate }: ExcalidrawCanvasProps) {
  const [title, setTitle] = useState(document.title)
  const [isReady, setIsReady] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dataRef = useRef<{ elements: any[]; appState: any; files: any }>({
    elements: [],
    appState: {},
    files: {},
  })

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 解析初始数据
  const getInitialData = useCallback(() => {
    try {
      const data = JSON.parse(document.content)
      return {
        elements: data.elements || [],
        appState: data.appState || {},
        files: data.files || {},
      }
    } catch {
      return {
        elements: [],
        appState: {},
        files: {},
      }
    }
  }, [document.content])

  // 防抖保存
  const saveContent = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      const { elements, appState, files } = dataRef.current
      const content = JSON.stringify({
        elements,
        appState: {
          viewBackgroundColor: appState?.viewBackgroundColor,
          currentItemFontFamily: appState?.currentItemFontFamily,
          zoom: appState?.zoom,
          scrollX: appState?.scrollX,
          scrollY: appState?.scrollY,
        },
        files,
      })
      onUpdate({ content })
    }, 1000)
  }, [onUpdate])

  // 标题变化时保存
  useEffect(() => {
    if (title !== document.title) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        onUpdate({ title })
      }, 500)
    }
  }, [title, document.title, onUpdate])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  // 延迟渲染 Excalidraw
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const initialData = getInitialData()

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    dataRef.current = { elements: [...elements], appState, files }
    saveContent()
  }, [saveContent])

  const LoadingFallback = (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-gray-500">加载画布中...</p>
      </div>
    </div>
  )

  const ErrorFallback = (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center text-red-500">
        <p className="mb-2">画布加载失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-700"
        >
          刷新页面
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 文档标题 */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-lg font-medium text-text bg-transparent border-none outline-none placeholder-gray-300"
          placeholder="无标题画布"
        />
        <div className="mt-1 text-xs text-gray-400 flex items-center gap-4">
          <span>创建于 {formatTime(document.createdAt)}</span>
          <span>上次保存 {formatTime(document.updatedAt)}</span>
        </div>
      </div>
      
      {/* Excalidraw 画布 */}
      <ErrorBoundary fallback={ErrorFallback}>
        {isReady ? (
          <Suspense fallback={LoadingFallback}>
            <div className="flex-1 relative">
              <Excalidraw
                initialData={{
                  elements: initialData.elements,
                  appState: {
                    ...initialData.appState,
                    collaborators: new Map(),
                  },
                  files: initialData.files,
                }}
                onChange={handleChange}
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    export: false,
                    saveAsImage: false,
                  },
                }}
              />
            </div>
          </Suspense>
        ) : (
          LoadingFallback
        )}
      </ErrorBoundary>
    </div>
  )
}

export default ExcalidrawCanvas
