import React, { useState, useCallback, useRef, lazy, Suspense } from 'react'

// 懒加载 Excalidraw
const Excalidraw = lazy(async () => {
  const module = await import('@excalidraw/excalidraw')
  return { default: module.Excalidraw }
})

interface DrawingEditorModalProps {
  canvasData: string
  onSave: (imageData: string, excalidrawData: string) => void
  onClose: () => void
}

function DrawingEditorModal({ canvasData, onSave, onClose }: DrawingEditorModalProps) {
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<{ elements: any[]; appState: any; files: any }>({
    elements: [],
    appState: {},
    files: {},
  })

  // 解析初始数据
  const getInitialData = useCallback(() => {
    if (!canvasData) {
      return {
        elements: [],
        appState: {},
        files: {},
      }
    }
    try {
      const data = JSON.parse(canvasData)
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
  }, [canvasData])

  // 保存画布为图片
  const handleSave = async () => {
    try {
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const { elements, appState, files } = dataRef.current
      
      // 如果没有元素，使用默认尺寸
      if (!elements || elements.length === 0) {
        setError('画布为空，请先添加内容')
        return
      }
      
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: false,
          exportBackground: true,
          exportPadding: 20, // 添加边距
        },
        files,
        // 不指定 getDimensions，让 Excalidraw 自动根据内容计算尺寸
      })
      
      // 转换为 base64
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        // 同时保存 Excalidraw 原始数据
        const excalidrawData = JSON.stringify({
          elements: dataRef.current.elements,
          appState: dataRef.current.appState,
          files: dataRef.current.files,
        })
        onSave(base64, excalidrawData)
      }
      reader.readAsDataURL(blob)
    } catch (err) {
      console.error('Failed to export canvas:', err)
      setError('导出画布失败')
    }
  }

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    dataRef.current = { elements: [...elements], appState, files }
  }, [])

  const initialData = getInitialData()

  const LoadingFallback = (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-gray-500">加载画布中...</p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[85vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="text-lg font-medium">编辑画布</h3>
          <div className="flex items-center gap-2">
            {error && <span className="text-sm text-red-500">{error}</span>}
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
        
        {/* Excalidraw 画布 */}
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
      </div>
    </div>
  )
}

export default DrawingEditorModal
