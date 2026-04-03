import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import type { Document } from '@shared/types'
import { cleanExcalidrawData } from '../utils/canvasUtils'

// 初始化 Excalidraw 字体路径（必须在 Excalidraw import 之前完成）
const fontPathReady = (async () => {
  const isPackaged = window.location.href.includes('file://')
  if (isPackaged) {
    const assetPath = await window.electronAPI.app.getAssetPath()
    if (assetPath) {
      window.EXCALIDRAW_ASSET_PATH = assetPath
    }
  }
})()

// 懒加载 Excalidraw（等待字体路径设置完成后再 import）
const Excalidraw = lazy(async () => {
  await fontPathReady
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

  // 使用 ref 稳定 onUpdate 引用，避免 store 更新导致防抖失效
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

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

  // 导出图片
  const handleExportImage = async () => {
    try {
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const { elements, appState, files } = dataRef.current
      
      if (!elements || elements.length === 0) {
        alert('画布为空，请先添加内容')
        return
      }
      
      const { activeElements, cleanedFiles } = cleanExcalidrawData(elements, files)
      
      const blob = await exportToBlob({
        elements: activeElements,
        appState: {
          ...appState,
          exportWithDarkMode: false,
          exportBackground: true,
        },
        files: cleanedFiles,
        exportPadding: 20,
        quality: 1,
        getDimensions: (width: number, height: number) => ({
          width: width * 4,
          height: height * 4,
          scale: 4,
        }),
      })
      
      // 转换为 base64
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result as string
        await window.electronAPI.file.downloadImage(base64, `${title || '画布'}.png`)
      }
      reader.readAsDataURL(blob)
    } catch (err) {
      console.error('Export image error:', err)
    }
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
      const { activeElements, cleanedFiles } = cleanExcalidrawData(elements, files)
      const content = JSON.stringify({
        elements: activeElements,
        appState: {
          viewBackgroundColor: appState?.viewBackgroundColor,
          currentItemFontFamily: appState?.currentItemFontFamily,
          zoom: appState?.zoom,
          scrollX: appState?.scrollX,
          scrollY: appState?.scrollY,
        },
        files: cleanedFiles,
      })
      onUpdateRef.current({ content })
    }, 1000)
  }, [])

  // 标题变化时保存
  useEffect(() => {
    if (title !== document.title) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        onUpdateRef.current({ title })
      }, 500)
    }
  }, [title, document.title])

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

  const handleChange = useCallback((elements: any[], appState: any, files: any) => {
    const { activeElements, cleanedFiles } = cleanExcalidrawData(elements, files)
    dataRef.current = { elements: activeElements, appState, files: cleanedFiles }
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
    <div className="h-full flex flex-col">
      {/* 文档标题 */}
      <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-lg font-medium bg-transparent border-none outline-none"
              style={{ color: 'var(--text-primary)' }}
              placeholder="无标题画布"
            />
            <div className="mt-1 text-xs flex items-center gap-4" style={{ color: 'var(--text-secondary)' }}>
              <span>创建于 {formatTime(document.createdAt)}</span>
              <span>上次保存 {formatTime(document.updatedAt)}</span>
            </div>
          </div>
          <button
            onClick={handleExportImage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="导出图片"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>导出图片</span>
          </button>
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
                    currentItemFontFamily: initialData.appState?.currentItemFontFamily ?? 5, // 5 = Excalifont（内置 Xiaolai 小赖字体作为中文 fallback）
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
