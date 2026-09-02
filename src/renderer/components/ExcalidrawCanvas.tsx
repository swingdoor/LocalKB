import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { Download, Eye, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { ExcalidrawScene, LoadedCanvas } from '@shared/knowledge-types'
import { usePendingSave } from '../hooks/usePendingSave'
import { useAppStore } from '../stores/appStore'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Skeleton } from './ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { getResourceScreenTheme, preserveExcalidrawContentTheme } from '../resource-screen-theme'

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
        <div className="grid flex-1 place-items-center bg-background px-8">
          <Alert variant="destructive" className="max-w-lg">
            <AlertTitle>画布加载失败</AlertTitle>
            <AlertDescription className="break-words">{this.state.error.message}</AlertDescription>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => this.setState({ error: null })}>
              <RotateCcw className="mr-2 h-4 w-4" />重试加载
            </Button>
          </Alert>
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
  const persistedAppStateRef = useRef(canvas.content.appState as Record<string, unknown>)

  // 画布模式状态
  const [viewModeEnabled, setViewModeEnabled] = useState(false)
  const [zenModeEnabled, setZenModeEnabled] = useState(false)

  const renameContent = useAppStore((state) => state.renameContent)
  const applicationTheme = useAppStore((state) => state.generalSettings.applicationTheme)
  const resourceTheme = getResourceScreenTheme(applicationTheme)
  const pendingSave = usePendingSave<{ title?: string; scene?: boolean }>(async (patch) => {
    if (patch.scene) {
      const { serializeAsJSON } = await import('@excalidraw/excalidraw')
      const { elements, appState, files } = dataRef.current
      const serialized = serializeAsJSON(
        elements,
        preserveExcalidrawContentTheme(appState, persistedAppStateRef.current),
        files,
        'local',
      )
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
        toast.info('画布为空，请先添加内容')
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
      toast.error('画布导出失败，请重试')
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
    <div className="flex flex-1 flex-col gap-3 bg-background p-6" role="status" aria-label="正在加载画布">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="flex-1" />
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 文档标题 */}
      <div className="flex-shrink-0 border-b px-4 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              aria-label="画布标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full border-0 px-0 text-[22px] font-medium leading-7 shadow-none focus-visible:ring-0"
              placeholder="无标题画布"
            />
            <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
              <span>创建于 {formatTime(canvas.createdAt)}</span>
              <span>上次保存 {formatTime(canvas.updatedAt)}</span>
              {(pendingSave.pending || pendingSave.saving) && <span>正在保存…</span>}
              {pendingSave.error && (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-destructive"
                  onClick={() => void pendingSave.retry().catch(() => undefined)}
                >保存失败，重试</Button>
              )}
            </div>
          </div>
          
          {/* 画布模式工具栏 */}
          <div className="flex flex-none items-center gap-2">
            {/* 视图模式 */}
            <Tooltip>
              <TooltipTrigger asChild><Button type="button" variant={viewModeEnabled ? 'secondary' : 'ghost'} size="sm" onClick={toggleViewMode}><Eye className="mr-2 h-4 w-4" />查看</Button></TooltipTrigger>
              <TooltipContent>只读查看模式</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild><Button type="button" variant={zenModeEnabled ? 'secondary' : 'ghost'} size="sm" onClick={toggleZenMode}><Sparkles className="mr-2 h-4 w-4" />禅</Button></TooltipTrigger>
              <TooltipContent>专注画图模式</TooltipContent>
            </Tooltip>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleExportImage()}>
              <Download className="mr-2 h-4 w-4" />导出
            </Button>
          </div>
        </div>
      </div>
      
      {/* Excalidraw 画布 */}
      <CanvasErrorBoundary>
        {isReady ? (
          <Suspense fallback={LoadingFallback}>
            <div
              className="relative flex-1"
              data-resource-screen-theme={resourceTheme.id}
              style={{ backgroundColor: resourceTheme.canvasSurface }}
            >
              <Excalidraw
                initialData={initialData}
                theme={resourceTheme.excalidrawAppearance}
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
