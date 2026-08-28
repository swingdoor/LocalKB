import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Resizable } from 'react-resizable'
import type { ResizeCallbackData, ResizeHandleAxis } from 'react-resizable'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import type { MindElixirInstance } from 'mind-elixir'
import { TIPTAP_REFERENCE_NODE_TYPES } from '@shared/knowledge-types'
import type { ExcalidrawScene, MindMapData } from '@shared/knowledge-types'

type Alignment = 'left' | 'center' | 'right'
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.2
const MIN_PREVIEW_WIDTH = 160
const MIN_PREVIEW_HEIGHT = 180
const MAX_PREVIEW_HEIGHT = 1200
const DEFAULT_PREVIEW_HEIGHT = 320
const FIT_PADDING = 16

export function clampPreviewZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function calculatePreviewFit(
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
  padding = FIT_PADDING,
): { scale: number; x: number; y: number } {
  const availableWidth = Math.max(1, viewportWidth - padding * 2)
  const availableHeight = Math.max(1, viewportHeight - padding * 2)
  const scale = Math.min(MAX_ZOOM, availableWidth / contentWidth, availableHeight / contentHeight)
  return {
    scale,
    x: (viewportWidth - contentWidth * scale) / 2,
    y: (viewportHeight - contentHeight * scale) / 2,
  }
}

interface ResourceOptions {
  vaultId: string
  documentId: string
  onEdit: (resourceId: string) => void
}

function alignmentPosition(textAlign: Alignment): React.CSSProperties['justifyItems'] {
  if (textAlign === 'right') return 'end'
  if (textAlign === 'center') return 'center'
  return 'start'
}

function resizeHandleLabel(axis: ResizeHandleAxis): string {
  if (axis === 'e') return '调整预览宽度'
  if (axis === 's') return '调整预览高度'
  return '调整预览大小'
}

function ReferenceShell({
  children, width, height, textAlign, selected, resizeHeight = false, updateAttributes, onResize,
  onSelect, onDoubleClick,
}: {
  children: React.ReactNode
  width: number | null
  height?: number | null
  textAlign: Alignment
  selected: boolean
  resizeHeight?: boolean
  updateAttributes: (attrs: Record<string, unknown>) => void
  onResize?: () => void
  onSelect: () => void
  onDoubleClick: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [draftSize, setDraftSize] = useState({
    width: width ?? 640,
    height: resizeHeight ? height ?? DEFAULT_PREVIEW_HEIGHT : 1,
  })
  const [resizeMaxWidth, setResizeMaxWidth] = useState(Number.MAX_SAFE_INTEGER)

  useEffect(() => {
    const nextSize = {
      width: width ?? 640,
      height: resizeHeight ? height ?? DEFAULT_PREVIEW_HEIGHT : 1,
    }
    setDraftSize(nextSize)
  }, [height, resizeHeight, width])

  const handleResizeStart = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation()
    const frame = frameRef.current
    if (!frame) return
    const bounds = frame.getBoundingClientRect()
    const nextSize = {
      width: Math.max(MIN_PREVIEW_WIDTH, Math.round(bounds.width)),
      height: resizeHeight
        ? Math.min(MAX_PREVIEW_HEIGHT, Math.max(MIN_PREVIEW_HEIGHT, Math.round(bounds.height)))
        : 1,
    }
    setResizeMaxWidth(Math.max(MIN_PREVIEW_WIDTH, frame.parentElement?.clientWidth ?? nextSize.width))
    setDraftSize(nextSize)
  }, [resizeHeight])

  const handleResize = useCallback((event: React.SyntheticEvent, data: ResizeCallbackData) => {
    event.stopPropagation()
    setDraftSize({
      width: Math.round(data.size.width),
      height: resizeHeight ? Math.round(data.size.height) : 1,
    })
    onResize?.()
  }, [onResize, resizeHeight])

  const handleResizeStop = useCallback((event: React.SyntheticEvent, data: ResizeCallbackData) => {
    event.stopPropagation()
    const nextSize = {
      width: Math.round(data.size.width),
      height: resizeHeight ? Math.round(data.size.height) : 1,
    }
    setDraftSize(nextSize)
    updateAttributes(resizeHeight
      ? { width: nextSize.width, height: nextSize.height }
      : { width: nextSize.width })
  }, [resizeHeight, updateAttributes])

  const renderResizeHandle = useCallback((axis: ResizeHandleAxis, ref: React.RefObject<HTMLElement>) => (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      data-resource-control=""
      data-resource-resize-handle={axis}
      aria-label={resizeHandleLabel(axis)}
      className={`resource-resize-handle resource-resize-handle-${axis}`}
      onMouseDown={(event) => event.stopPropagation()}
    />
  ), [])

  const frameStyle: React.CSSProperties = {
    width: `${draftSize.width}px`,
    height: resizeHeight ? `${draftSize.height}px` : 'auto',
    minWidth: MIN_PREVIEW_WIDTH,
    minHeight: resizeHeight ? MIN_PREVIEW_HEIGHT : undefined,
    maxWidth: '100%',
    maxHeight: resizeHeight ? MAX_PREVIEW_HEIGHT : undefined,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-editor)',
    borderColor: selected ? 'var(--primary-color)' : 'transparent',
  }
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-resource-alignment-row=""
      data-text-align={textAlign}
      style={{
        display: 'grid',
        width: '100%',
        justifyItems: alignmentPosition(textAlign),
      }}
      onDragStart={(event: React.DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <Resizable
        width={draftSize.width}
        height={draftSize.height}
        axis={resizeHeight ? 'both' : 'x'}
        resizeHandles={selected ? (resizeHeight ? ['e', 's', 'se'] : ['e']) : []}
        minConstraints={[MIN_PREVIEW_WIDTH, resizeHeight ? MIN_PREVIEW_HEIGHT : 1]}
        maxConstraints={[resizeMaxWidth, resizeHeight ? MAX_PREVIEW_HEIGHT : 1]}
        draggableOpts={{ enableUserSelectHack: false }}
        handle={renderResizeHandle}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeStop={handleResizeStop}
      >
        <div
          ref={frameRef}
          data-resource-preview-container=""
          data-resource-control=""
          style={frameStyle}
          className="group relative rounded-lg border"
          onPointerDownCapture={(event) => {
            if (event.button === 0 && !selected) onSelect()
          }}
        >
          <div
            data-resource-frame=""
            className="relative h-full w-full overflow-hidden rounded-[7px]"
            onDoubleClick={onDoubleClick}
          >
            {children}
          </div>
        </div>
      </Resizable>
    </NodeViewWrapper>
  )
}

function stopInteractiveResourceEvent({ event }: { event: Event }): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('[data-resource-control], [data-resource-viewport]'))
}

export function PreviewControls({
  zoom, selected, onZoomOut, onZoomIn, onFit,
}: {
  zoom: number
  selected: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
}) {
  const stop = (event: React.SyntheticEvent) => event.stopPropagation()
  const buttonClass = 'grid h-7 w-7 place-items-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary focus:outline-none focus:ring-1 focus:ring-primary'
  return (
    <div
      role="toolbar"
      aria-label="资源预览控制"
      data-resource-control=""
      className={`absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
      onMouseDown={stop}
      onDoubleClick={stop}
    >
      <button type="button" aria-label="缩小预览" className={buttonClass} onClick={onZoomOut}><Minus size={14} /></button>
      <span className="w-11 text-center text-[11px] tabular-nums text-gray-500" aria-label={`当前缩放 ${Math.round(zoom * 100)}%`}>
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" aria-label="放大预览" className={buttonClass} onClick={onZoomIn}><Plus size={14} /></button>
      <button type="button" aria-label="适应窗口" className={buttonClass} onClick={onFit}><Maximize2 size={14} /></button>
    </div>
  )
}

export function CanvasReferenceView({ node, updateAttributes, selected, extension, editor, getPos }: any) {
  const options = extension.options as ResourceOptions
  const { canvasId, width, height, textAlign } = node.attrs as {
    canvasId: string; width: number | null; height: number | null; textAlign: Alignment
  }
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [zoom, setZoom] = useState(1)
  const viewportRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null)
  const manuallyAdjustedRef = useRef(false)

  const changeZoom = useCallback((direction: 'in' | 'out') => {
    const transform = transformRef.current
    if (!transform) return
    manuallyAdjustedRef.current = true
    if (direction === 'in') transform.zoomIn(ZOOM_STEP, 0)
    else transform.zoomOut(ZOOM_STEP, 0)
  }, [])
  const fit = useCallback(() => {
    const viewport = viewportRef.current
    const transform = transformRef.current
    if (!viewport || !transform || !preview) return
    const next = calculatePreviewFit(
      viewport.clientWidth,
      viewport.clientHeight,
      preview.width,
      preview.height,
    )
    transform.setTransform(next.x, next.y, next.scale, 0)
    setZoom(next.scale)
    manuallyAdjustedRef.current = false
  }, [preview])
  const fitAfterFrameResize = useCallback(() => {
    requestAnimationFrame(fit)
  }, [fit])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!manuallyAdjustedRef.current) requestAnimationFrame(fit)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [fit])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setStatus('loading')
    setPreview(null)
    setZoom(1)
    manuallyAdjustedRef.current = false
    void (async () => {
      const result = await window.electronAPI.knowledge.getCanvas(
        options.vaultId, canvasId, options.documentId,
      )
      if (!result.ok) {
        if (!cancelled) setStatus(result.error.code === 'NOT_FOUND' ? 'missing' : 'error')
        return
      }
      try {
        const { exportToSvg } = await import('@excalidraw/excalidraw')
        const scene = result.data as ExcalidrawScene
        const svg = await exportToSvg({
          elements: scene.elements as any,
          appState: { ...scene.appState, exportBackground: false } as any,
          files: scene.files as any,
          exportPadding: 20,
        })
        const viewBox = svg.viewBox.baseVal
        const previewWidth = viewBox.width || Number.parseFloat(svg.getAttribute('width') ?? '') || 1
        const previewHeight = viewBox.height || Number.parseFloat(svg.getAttribute('height') ?? '') || 1
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) {
          setPreview({ url: objectUrl, width: previewWidth, height: previewHeight })
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [canvasId, options.documentId, options.vaultId, revision])

  useEffect(() => window.electronAPI.knowledge.onChanged((event) => {
    if (event.vaultId === options.vaultId && event.resourceType === 'canvas' &&
        event.resourceId === canvasId) setRevision((value) => value + 1)
  }), [canvasId, options.vaultId])

  return (
    <ReferenceShell
      width={width}
      height={height}
      textAlign={textAlign}
      selected={selected}
      resizeHeight
      updateAttributes={updateAttributes}
      onResize={fitAfterFrameResize}
      onSelect={() => {
        const position = getPos()
        if (typeof position === 'number') editor.chain().focus().setNodeSelection(position).run()
      }}
      onDoubleClick={() => options.onEdit(canvasId)}
    >
      <div
        ref={viewportRef}
        data-resource-viewport=""
        className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ backgroundColor: 'var(--bg-editor)' }}
      >
        {status === 'ready' && preview && (
          <TransformWrapper
            key={preview.url}
            ref={transformRef}
            minScale={0.05}
            maxScale={MAX_ZOOM}
            limitToBounds={false}
            centerZoomedOut={false}
            wheel={{ step: ZOOM_STEP, wheelDisabled: true }}
            trackPadPanning={{ disabled: true }}
            doubleClick={{ disabled: true }}
            panning={{ velocityDisabled: true }}
            onInit={() => requestAnimationFrame(fit)}
            onTransform={(_ref, state) => setZoom(state.scale)}
            onPanningStart={() => { manuallyAdjustedRef.current = true }}
            onWheelStart={() => { manuallyAdjustedRef.current = true }}
            onPinchStart={() => { manuallyAdjustedRef.current = true }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
              contentStyle={{ width: preview.width, height: preview.height }}
            >
              <img
                src={preview.url}
                alt="画布预览"
                draggable={false}
                className="pointer-events-none block h-full w-full select-none"
                style={{ maxWidth: 'none' }}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>
      {status === 'ready' && (
        <PreviewControls
          zoom={zoom}
          selected={selected}
          onZoomOut={() => changeZoom('out')}
          onZoomIn={() => changeZoom('in')}
          onFit={fit}
        />
      )}
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center bg-white/80 text-sm text-gray-500">正在加载画布…</div>}
      {status === 'missing' && <div className="absolute inset-0 grid place-items-center bg-white px-8 text-center text-sm text-red-500">画布资源不存在，双击可恢复编辑</div>}
      {status === 'error' && (
        <button type="button" className="absolute inset-0 bg-white text-sm text-red-500" onClick={() => setRevision((value) => value + 1)}>
          画布预览失败，点击重试
        </button>
      )}
    </ReferenceShell>
  )
}

export function MindMapReferenceView({ node, updateAttributes, selected, extension, editor, getPos }: any) {
  const options = extension.options as ResourceOptions
  const { mindmapId, width, height, textAlign } = node.attrs as {
    mindmapId: string; width: number | null; height: number | null; textAlign: Alignment
  }
  const containerRef = useRef<HTMLDivElement>(null)
  const mindRef = useRef<MindElixirInstance | null>(null)
  const manuallyAdjustedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  const [zoom, setZoom] = useState(1)

  const fit = useCallback(() => {
    const mind = mindRef.current
    if (!mind) return
    mind.scaleFit()
    setZoom(mind.scaleVal)
    manuallyAdjustedRef.current = false
  }, [])
  const fitAfterFrameResize = useCallback(() => {
    requestAnimationFrame(fit)
  }, [fit])

  const changeZoom = useCallback((next: number, event?: { clientX: number; clientY: number }) => {
    const mind = mindRef.current
    if (!mind) return
    const value = clampPreviewZoom(next)
    mind.scale(value, event ? { x: event.clientX, y: event.clientY } : undefined)
    setZoom(mind.scaleVal)
    manuallyAdjustedRef.current = true
  }, [])

  const handleMindMapWheel = useCallback((event: WheelEvent) => {
    if (!event.metaKey && !event.ctrlKey) return
    const mind = mindRef.current
    if (!mind) return
    event.preventDefault()
    event.stopPropagation()
    changeZoom(mind.scaleVal + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event)
  }, [changeZoom])

  const load = useCallback(async () => {
    setStatus('loading')
    const result = await window.electronAPI.knowledge.getMindMap(
      options.vaultId, options.documentId, mindmapId,
    )
    if (!result.ok) {
      setStatus(result.error.code === 'NOT_FOUND' ? 'missing' : 'error')
      return
    }
    if (!containerRef.current) return
    try {
      const { default: MindElixir } = await import('mind-elixir')
      containerRef.current.innerHTML = ''
      containerRef.current.style.setProperty('--bgcolor', 'var(--bg-editor)')
      const mind = new MindElixir({
        el: containerRef.current,
        editable: false,
        keypress: false,
        toolBar: false,
        contextMenu: false,
        overflowHidden: false,
        handleWheel: handleMindMapWheel,
        scaleMin: MIN_ZOOM,
        scaleMax: MAX_ZOOM,
      } as any)
      mind.init(result.data as MindMapData as any)
      mindRef.current = mind
      setStatus('ready')
      requestAnimationFrame(() => requestAnimationFrame(fit))
    } catch {
      setStatus('error')
    }
  }, [mindmapId, options.documentId, options.vaultId, fit, handleMindMapWheel])

  useEffect(() => {
    void load()
    return () => {
      mindRef.current?.destroy()
      mindRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [load, revision])
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!manuallyAdjustedRef.current) requestAnimationFrame(fit)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [fit])
  useEffect(() => window.electronAPI.knowledge.onChanged((event) => {
    if (event.vaultId === options.vaultId && event.resourceType === 'mindmap' &&
        event.resourceId === mindmapId) setRevision((value) => value + 1)
  }), [mindmapId, options.vaultId])

  return (
    <ReferenceShell
      width={width}
      height={height}
      textAlign={textAlign}
      selected={selected}
      resizeHeight
      updateAttributes={updateAttributes}
      onResize={fitAfterFrameResize}
      onSelect={() => {
        const position = getPos()
        if (typeof position === 'number') editor.chain().focus().setNodeSelection(position).run()
      }}
      onDoubleClick={() => options.onEdit(mindmapId)}
    >
      <div
        ref={containerRef}
        data-resource-viewport=""
        data-resource-interactive="true"
        className="h-full w-full cursor-grab overflow-hidden rounded-[7px] active:cursor-grabbing"
        style={{ backgroundColor: 'var(--bg-editor)' }}
        onPointerDownCapture={() => { manuallyAdjustedRef.current = true }}
      />
      {status === 'ready' && (
        <PreviewControls
          zoom={zoom}
          selected={selected}
          onZoomOut={() => changeZoom(zoom - ZOOM_STEP)}
          onZoomIn={() => changeZoom(zoom + ZOOM_STEP)}
          onFit={fit}
        />
      )}
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center bg-white/80 text-sm text-gray-500">正在加载思维导图…</div>}
      {status === 'missing' && <div className="absolute inset-0 grid place-items-center bg-white text-sm text-red-500">思维导图资源不存在</div>}
      {status === 'error' && (
        <button type="button" className="absolute inset-0 bg-white text-sm text-red-500" onClick={() => setRevision((value) => value + 1)}>
          思维导图预览失败，点击重试
        </button>
      )}
    </ReferenceShell>
  )
}

function AssetImageView({ node, updateAttributes, selected, extension, editor, getPos }: any) {
  const options = extension.options as ResourceOptions
  const { assetId, width, textAlign, alt } = node.attrs as {
    assetId: string; width: number | null; textAlign: Alignment; alt: string | null
  }
  const [failed, setFailed] = useState(false)
  const src = `localkb-resource://asset/${encodeURIComponent(options.vaultId)}/${encodeURIComponent(options.documentId)}/${encodeURIComponent(assetId)}`
  return (
    <ReferenceShell
      width={width}
      textAlign={textAlign}
      selected={selected}
      updateAttributes={updateAttributes}
      onSelect={() => {
        const position = getPos()
        if (typeof position === 'number') editor.chain().focus().setNodeSelection(position).run()
      }}
      onDoubleClick={() => undefined}
    >
      {failed ? (
        <button type="button" className="w-full p-8 text-sm text-red-500" onClick={() => setFailed(false)}>
          图片加载失败，点击重试
        </button>
      ) : (
        <img src={src} alt={alt ?? ''} className="block h-auto w-full" onError={() => setFailed(true)} />
      )}
    </ReferenceShell>
  )
}

const presentationAttributes = {
  nodeId: { default: null },
  width: { default: null },
  textAlign: { default: 'left' },
}

const previewPresentationAttributes = {
  ...presentationAttributes,
  height: { default: null },
}

function referenceHtml(
  kind: 'canvas' | 'mindmap' | 'asset',
  resourceId: unknown,
  attributes: Record<string, unknown>,
): Record<string, string> {
  const width = typeof attributes.width === 'number' ? `max-width:${attributes.width}px;` : 'max-width:640px;'
  const height = typeof attributes.height === 'number' ? `height:${attributes.height}px;` : ''
  const align = attributes.textAlign === 'center'
    ? 'margin-left:auto;margin-right:auto;'
    : attributes.textAlign === 'right' ? 'margin-left:auto;' : 'margin-right:auto;'
  return {
    [`data-${kind}-id`]: String(resourceId ?? ''),
    'data-node-id': String(attributes.nodeId ?? ''),
    'data-text-align': String(attributes.textAlign ?? 'left'),
    ...(height ? { 'data-height': String(attributes.height) } : {}),
    style: `${width}${height}${align}`,
  }
}

export const CanvasReference = Node.create<ResourceOptions>({
  name: TIPTAP_REFERENCE_NODE_TYPES.canvas, group: 'block', atom: true, draggable: false,
  addOptions: () => ({ vaultId: '', documentId: '', onEdit: () => undefined }),
  addAttributes: () => ({ canvasId: { default: null }, ...previewPresentationAttributes }),
  parseHTML: () => [{ tag: 'div[data-canvas-reference]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(
    { 'data-canvas-reference': '' },
    referenceHtml('canvas', HTMLAttributes.canvasId, HTMLAttributes),
  )],
  addNodeView: () => ReactNodeViewRenderer(CanvasReferenceView, { stopEvent: stopInteractiveResourceEvent }),
})

export const MindMapReference = Node.create<ResourceOptions>({
  name: TIPTAP_REFERENCE_NODE_TYPES.mindmap, group: 'block', atom: true, draggable: false,
  addOptions: () => ({ vaultId: '', documentId: '', onEdit: () => undefined }),
  addAttributes: () => ({ mindmapId: { default: null }, ...previewPresentationAttributes }),
  parseHTML: () => [{ tag: 'div[data-mindmap-reference]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(
    { 'data-mindmap-reference': '' },
    referenceHtml('mindmap', HTMLAttributes.mindmapId, HTMLAttributes),
  )],
  addNodeView: () => ReactNodeViewRenderer(MindMapReferenceView, { stopEvent: stopInteractiveResourceEvent }),
})

export const AssetImage = Node.create<Omit<ResourceOptions, 'onEdit'>>({
  name: TIPTAP_REFERENCE_NODE_TYPES.asset, group: 'block', atom: true, draggable: true,
  addOptions: () => ({ vaultId: '', documentId: '' }),
  addAttributes: () => ({ assetId: { default: null }, alt: { default: null }, ...presentationAttributes }),
  parseHTML: () => [{ tag: 'img[data-asset-id]' }],
  renderHTML: ({ HTMLAttributes }) => ['img', mergeAttributes(
    { 'data-asset-image': '', alt: String(HTMLAttributes.alt ?? '') },
    referenceHtml('asset', HTMLAttributes.assetId, HTMLAttributes),
  )],
  addNodeView: () => ReactNodeViewRenderer(AssetImageView),
})
