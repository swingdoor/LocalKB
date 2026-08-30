import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { EditorInteractionCoordinator } from '../editor/interactionContext'
import { createReadOnlyMindMap, type MindMapSurface } from '../mindmap/mindElixirAdapter'
import MindMapNoteMarkers from './MindMapNoteMarkers'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.2

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

interface MindMapPreviewProps {
  vaultId: string
  documentId: string
  mindmapId: string
  selected: boolean
  interaction?: EditorInteractionCoordinator
  editorDom?: HTMLElement | null
  fitRef: MutableRefObject<(() => void) | null>
}

export default function MindMapPreview({
  vaultId, documentId, mindmapId, selected, interaction, editorDom, fitRef,
}: MindMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<MindMapSurface | null>(null)
  const fitFrameRef = useRef<number | null>(null)
  const manuallyAdjustedRef = useRef(false)
  const panningRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [zoom, setZoom] = useState(1)

  const stopPanning = useCallback(() => {
    if (!panningRef.current) return
    panningRef.current = false
    interaction?.endGesture('resourcePanning')
  }, [interaction])

  useEffect(() => {
    window.addEventListener('pointerup', stopPanning)
    window.addEventListener('pointercancel', stopPanning)
    window.addEventListener('blur', stopPanning)
    return () => {
      window.removeEventListener('pointerup', stopPanning)
      window.removeEventListener('pointercancel', stopPanning)
      window.removeEventListener('blur', stopPanning)
      stopPanning()
    }
  }, [stopPanning])

  const fit = useCallback(() => {
    const mind = surfaceRef.current?.instance
    if (!mind) return
    mind.scaleFit()
    setZoom(mind.scaleVal)
    manuallyAdjustedRef.current = false
  }, [])

  const scheduleFit = useCallback(() => {
    if (fitFrameRef.current !== null) cancelAnimationFrame(fitFrameRef.current)
    fitFrameRef.current = requestAnimationFrame(() => { fitFrameRef.current = null; fit() })
  }, [fit])

  useEffect(() => {
    fitRef.current = scheduleFit
    return () => { if (fitRef.current === scheduleFit) fitRef.current = null }
  }, [fitRef, scheduleFit])

  const changeZoom = useCallback((value: number, event?: { clientX: number; clientY: number }) => {
    const mind = surfaceRef.current?.instance
    if (!mind) return
    mind.scale(clampZoom(value), event ? { x: event.clientX, y: event.clientY } : undefined)
    setZoom(mind.scaleVal)
    manuallyAdjustedRef.current = true
  }, [])

  const handleWheel = useCallback((event: WheelEvent) => {
    if (!event.metaKey && !event.ctrlKey) return
    const mind = surfaceRef.current?.instance
    if (!mind) return
    event.preventDefault()
    event.stopPropagation()
    interaction?.beginGesture('resourcePanning', 'mindmapReference')
    changeZoom(mind.scaleVal + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event)
    interaction?.endGesture('resourcePanning')
  }, [changeZoom, interaction])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setZoom(1)
    manuallyAdjustedRef.current = false
    surfaceRef.current?.dispose()
    surfaceRef.current = null

    void (async () => {
      const result = await window.electronAPI.knowledge.getMindMap(vaultId, documentId, mindmapId)
      if (cancelled) return
      if (!result.ok) { setStatus(result.error.code === 'NOT_FOUND' ? 'missing' : 'error'); return }
      const container = containerRef.current
      if (!container) return
      try {
        const surface = createReadOnlyMindMap(container, result.data, { handleWheel })
        if (cancelled) { surface.dispose(); return }
        surfaceRef.current = surface
        setStatus('ready')
        scheduleFit()
      } catch {
        surfaceRef.current?.dispose()
        surfaceRef.current = null
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      if (fitFrameRef.current !== null) cancelAnimationFrame(fitFrameRef.current)
      fitFrameRef.current = null
      surfaceRef.current?.dispose()
      surfaceRef.current = null
    }
  }, [documentId, handleWheel, mindmapId, revision, scheduleFit, vaultId])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (!manuallyAdjustedRef.current) scheduleFit() })
    observer.observe(container)
    return () => observer.disconnect()
  }, [scheduleFit])

  useEffect(() => window.electronAPI.knowledge.onChanged((event) => {
    if (event.vaultId === vaultId && event.resourceType === 'mindmap' && event.resourceId === mindmapId) {
      setRevision((value) => value + 1)
    }
  }), [mindmapId, vaultId])

  useEffect(() => {
    if (!editorDom) return
    const reload = (event: Event) => {
      const detail = (event as CustomEvent<{ resourceType: string; resourceId: string }>).detail
      if (detail?.resourceType === 'mindmap' && detail.resourceId === mindmapId) setRevision((value) => value + 1)
    }
    editorDom.addEventListener('localkb:resource-preview-reload', reload)
    return () => editorDom.removeEventListener('localkb:resource-preview-reload', reload)
  }, [editorDom, mindmapId])

  return <>
    <div ref={containerRef} data-resource-viewport="" data-resource-interactive="true" className="h-full w-full cursor-grab overflow-hidden rounded-[7px] bg-white active:cursor-grabbing" onPointerDownCapture={(event) => {
      if (event.button !== 0) return
      if ((event.target as Element).closest?.('[data-mindmap-note-control]')) return
      panningRef.current = true
      manuallyAdjustedRef.current = true
      interaction?.beginGesture('resourcePanning', 'mindmapReference')
    }} />
    {status === 'ready' && <MindMapNoteMarkers instance={surfaceRef.current?.instance ?? null} portalContainer={containerRef.current?.parentElement ?? null} revision={revision} />}
    {status === 'ready' && <div role="toolbar" aria-label="资源预览控制" data-resource-control="" className={`resource-preview-controls absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg p-1 shadow-sm backdrop-blur transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`} onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="缩小预览" className="resource-preview-control-button" onClick={() => changeZoom(zoom - ZOOM_STEP)}><Minus size={14} /></button><span className="resource-preview-zoom w-11 text-center text-[11px] tabular-nums" aria-label={`当前缩放 ${Math.round(zoom * 100)}%`}>{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大预览" className="resource-preview-control-button" onClick={() => changeZoom(zoom + ZOOM_STEP)}><Plus size={14} /></button><button type="button" aria-label="适应窗口" className="resource-preview-control-button" onClick={fit}><Maximize2 size={14} /></button>
    </div>}
    {status === 'loading' && <div className="resource-preview-status absolute inset-0 grid place-items-center text-sm">正在加载思维导图…</div>}
    {status === 'missing' && <div className="resource-preview-status is-error absolute inset-0 grid place-items-center text-sm">思维导图资源不存在</div>}
    {status === 'error' && <button type="button" className="resource-preview-status is-error absolute inset-0 text-sm" onClick={() => setRevision((value) => value + 1)}>思维导图预览失败，点击重试</button>}
  </>
}
