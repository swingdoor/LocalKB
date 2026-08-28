import { lazy, Suspense, useCallback, useRef, useState, type ComponentProps } from 'react'
import type { ExcalidrawScene } from '@shared/knowledge-types'

const Excalidraw = lazy(async () => {
  const module = await import('@excalidraw/excalidraw')
  const Component = module.Excalidraw
  return { default: (props: ComponentProps<typeof Component>) => <Component {...props} /> }
})

interface DrawingEditorModalProps {
  canvasData: ExcalidrawScene | null
  loading?: boolean
  resourceError?: string | null
  onSave: (content: ExcalidrawScene) => Promise<void>
  onClose: () => void
}

const emptyScene: ExcalidrawScene = {
  type: 'excalidraw', version: 2, source: 'local', elements: [], appState: {}, files: {},
}

function DrawingEditorModal({
  canvasData, loading = false, resourceError, onSave, onClose,
}: DrawingEditorModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initial = canvasData ?? emptyScene
  const dataRef = useRef({
    elements: initial.elements as readonly any[],
    appState: initial.appState as any,
    files: initial.files as any,
  })

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const { serializeAsJSON } = await import('@excalidraw/excalidraw')
      const { elements, appState, files } = dataRef.current
      const content = JSON.parse(
        serializeAsJSON(elements as any, appState, files, 'local'),
      ) as ExcalidrawScene
      await onSave(content)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存画布失败')
    } finally {
      setSaving(false)
    }
  }, [onSave])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[85vh] w-[90vw] flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-lg font-medium">编辑画布</h3>
          <div className="flex items-center gap-2">
            {(error || resourceError) && <span className="text-sm text-red-500">{error || resourceError}</span>}
            <button
              type="button"
              disabled={saving || loading || !!resourceError}
              onClick={() => void handleSave()}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm text-gray-600">
              取消
            </button>
          </div>
        </div>
        {loading ? (
          <div className="grid flex-1 place-items-center text-gray-500">正在加载画布…</div>
        ) : resourceError ? (
          <div className="grid flex-1 place-items-center text-red-500">无法加载源画布，请关闭后重试</div>
        ) : (
          <Suspense fallback={<div className="grid flex-1 place-items-center text-gray-500">正在启动画布编辑器…</div>}>
            <div className="relative flex-1">
              <Excalidraw
                initialData={{
                  elements: initial.elements as any,
                  appState: {
                    ...initial.appState,
                    collaborators: new Map(),
                    currentItemFontFamily: initial.appState.currentItemFontFamily ?? 5,
                  } as any,
                  files: initial.files as any,
                }}
                onChange={(elements, appState, files) => {
                  dataRef.current = { elements, appState, files }
                }}
                UIOptions={{ canvasActions: { loadScene: false, export: false, saveAsImage: false } }}
              />
            </div>
          </Suspense>
        )}
      </div>
    </div>
  )
}

export default DrawingEditorModal
