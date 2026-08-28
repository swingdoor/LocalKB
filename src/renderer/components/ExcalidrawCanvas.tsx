import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import type { ExcalidrawScene, LoadedCanvas } from '@shared/knowledge-types'
import { usePendingSave } from '../hooks/usePendingSave'
import { useAppStore } from '../stores/appStore'

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
  canvas: LoadedCanvas
  onUpdate: (content: ExcalidrawScene) => Promise<LoadedCanvas | null>
}

// Excalidraw API 类型
// 错误边界组件
export class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Excalidraw Error:', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid flex-1 place-items-center bg-gray-50 px-8" role="alert">
          <div className="max-w-lg text-center">
            <AlertCircle className="mx-auto mb-3 text-red-500" size={30} strokeWidth={1.7} />
            <p className="font-medium text-red-500">画布加载失败</p>
            <p className="mt-2 break-words text-sm text-gray-500">{this.state.error.message}</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              onClick={() => this.setState({ error: null })}
            >
              <RotateCcw size={15} />
              重试加载
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ExcalidrawCanvas({ canvas, onUpdate }: ExcalidrawCanvasProps) {
  const [title, setTitle] = useState(canvas.title)
  const [isReady, setIsReady] = useState(false)
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null)
  const initialDataRef = useRef({
    elements: canvas.content.elements as any,
    appState: {
      ...canvas.content.appState,
      collaborators: new Map(),
      currentItemFontFamily: typeof canvas.content.appState?.currentItemFontFamily === 'number'
        ? canvas.content.appState.currentItemFontFamily : 5,
    } as any,
    files: canvas.content.files as any,
  })
  const dataRef = useRef<{ elements: readonly any[]; appState: any; files: any }>({
    elements: canvas.content.elements,
    appState: canvas.content.appState,
    files: canvas.content.files,
  })

  // 画布模式状态
  const [viewModeEnabled, setViewModeEnabled] = useState(false)
  const [zenModeEnabled, setZenModeEnabled] = useState(false)

  const renameContent = useAppStore((state) => state.renameContent)
  const pendingSave = usePendingSave<{ title?: string; scene?: boolean }>(async (patch) => {
    if (patch.scene) {
      const { serializeAsJSON } = await import('@excalidraw/excalidraw')
      const { elements, appState, files } = dataRef.current
      const serialized = serializeAsJSON(elements, appState, files, 'local')
      const saved = await onUpdate(JSON.parse(serialized) as ExcalidrawScene)
      if (!saved) throw new Error('画布保存失败')
    }
    if (patch.title !== undefined && !(await renameContent(canvas.id, patch.title))) {
      throw new Error('画布标题保存失败')
    }
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

  // 导出图片
  const handleExportImage = async () => {
    try {
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const { elements, appState, files } = dataRef.current
      
      if (!elements || elements.length === 0) {
        alert('画布为空，请先添加内容')
        return
      }
      
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: false,
          exportBackground: true,
        },
        files,
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

  // 标题变化时保存
  useEffect(() => {
    if (title !== canvas.title) pendingSave.schedule({ title })
  }, [title, canvas.title, pendingSave.schedule])

  // 延迟渲染 Excalidraw
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const initialData = initialDataRef.current

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    dataRef.current = { elements, appState, files }
    pendingSave.schedule({ scene: true })
  }, [pendingSave.schedule])

  // 切换查看模式
  const toggleViewMode = () => {
    const newValue = !viewModeEnabled
    setViewModeEnabled(newValue)
    if (excalidrawAPI) {
      excalidrawAPI.updateScene({ 
        appState: { 
          viewModeEnabled: newValue,
          zenModeEnabled: newValue ? false : zenModeEnabled,
        } 
      })
    }
    if (newValue) {
      setZenModeEnabled(false)
    }
  }

  // 切换禅模式
  const toggleZenMode = () => {
    const newValue = !zenModeEnabled
    setZenModeEnabled(newValue)
    if (excalidrawAPI) {
      excalidrawAPI.updateScene({ 
        appState: { 
          zenModeEnabled: newValue,
          viewModeEnabled: newValue ? false : viewModeEnabled,
        } 
      })
    }
    if (newValue) {
      setViewModeEnabled(false)
    }
  }

  // 获取 Excalidraw API
  const handleExcalidrawAPI = useCallback((api: any) => {
    setExcalidrawAPI(api)
  }, [])

  const LoadingFallback = (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-gray-500">加载画布中...</p>
      </div>
    </div>
  )

  // 模式切换按钮样式
  const modeButtonClass = (isActive: boolean) => `
    flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
    ${isActive 
      ? 'bg-primary text-white' 
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
  `

  return (
    <div className="h-full flex flex-col">
      {/* 文档标题 */}
      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-[22px] leading-7 font-medium bg-transparent border-none outline-none"
              style={{ color: 'var(--text-primary)' }}
              placeholder="无标题画布"
            />
            <div className="mt-1 text-xs flex items-center gap-4" style={{ color: 'var(--text-secondary)' }}>
              <span>创建于 {formatTime(canvas.createdAt)}</span>
              <span>上次保存 {formatTime(canvas.updatedAt)}</span>
              {(pendingSave.pending || pendingSave.saving) && <span>正在保存…</span>}
              {pendingSave.error && (
                <button
                  type="button"
                  className="text-red-500 underline"
                  onClick={() => void pendingSave.retry().catch(() => undefined)}
                >保存失败，重试</button>
              )}
            </div>
          </div>
          
          {/* 画布模式工具栏 */}
          <div className="flex flex-none items-center gap-2">
            {/* 视图模式 */}
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
              <button
                onClick={toggleViewMode}
                className={modeButtonClass(viewModeEnabled)}
                title="查看模式（只读）"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>查看</span>
              </button>
              <button
                onClick={toggleZenMode}
                className={modeButtonClass(zenModeEnabled)}
                title="禅模式（专注画图）"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span>禅</span>
              </button>
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
              <span>导出</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Excalidraw 画布 */}
      <CanvasErrorBoundary>
        {isReady ? (
          <Suspense fallback={LoadingFallback}>
            <div className="flex-1 relative">
              <Excalidraw
                initialData={initialData}
                onChange={handleChange}
                excalidrawAPI={handleExcalidrawAPI}
                langCode="zh-CN"
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    export: false,
                    saveAsImage: false,
                    saveToActiveFile: true,
                    clearCanvas: true,
                    changeViewBackgroundColor: true,
                    toggleTheme: null,
                  },
                }}
              />
            </div>
          </Suspense>
        ) : (
          LoadingFallback
        )}
      </CanvasErrorBoundary>
    </div>
  )
}

export default ExcalidrawCanvas
