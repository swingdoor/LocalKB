import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Resizable } from 'react-resizable'
import type { ResizeCallbackData, ResizeHandleAxis } from 'react-resizable'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { TIPTAP_REFERENCE_NODE_TYPES } from '@shared/knowledge-types'
import { renderManifestResourceMarkdown } from '../markdown/markdownSerializationContext'
import type { ExcalidrawScene } from '@shared/knowledge-types'
import type { EditorInteractionCoordinator } from '../editor/interactionContext'
import MindMapPreview from '../components/MindMapPreview'

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
  onEdit: (resourceId: string) => void
  interaction?: EditorInteractionCoordinator
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
  onSelect, onDoubleClick, interaction, nodeType,
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
  interaction?: EditorInteractionCoordinator
  nodeType: string
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
    interaction?.beginGesture('nodeResizing', nodeType)
  }, [interaction, nodeType, resizeHeight])

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
    interaction?.endGesture('nodeResizing')
    updateAttributes(resizeHeight
      ? { width: nextSize.width, height: nextSize.height }
      : { width: nextSize.width })
  }, [interaction, resizeHeight, updateAttributes])

  useEffect(() => () => interaction?.endGesture('nodeResizing'), [interaction])

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
      onDragStart={(event: React.DragEvent) => preventNativeResourceContentDrag(event)}
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
          data-resource-selection-frame=""
          data-resource-control=""
          style={frameStyle}
          className="group relative rounded-lg border"
          onClick={(event) => {
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

export function preventNativeResourceContentDrag(event: React.DragEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (!target.closest('[data-resource-viewport] img, [data-resource-viewport] svg, [data-resource-viewport] [draggable="true"]')) return
  event.preventDefault()
  event.stopPropagation()
}

export function stopInteractiveResourceEvent({ event }: { event: Event }): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  // The official editor-level DragHandle discovers the hovered top-level node
  // through mousemove. Let that passive event reach ProseMirror while keeping
  // clicks, pointer gestures, wheel zoom and resize controls inside the NodeView.
  if (event.type === 'mousemove') return false
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
  const buttonClass = 'resource-preview-control-button'
  return (
    <div
      role="toolbar"
      aria-label="资源预览控制"
      data-resource-control=""
      className={`resource-preview-controls absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg p-1 shadow-sm backdrop-blur transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
      onMouseDown={stop}
      onDoubleClick={stop}
    >
      <button type="button" aria-label="缩小预览" className={buttonClass} onClick={onZoomOut}><Minus size={14} /></button>
      <span className="resource-preview-zoom w-11 text-center text-[11px] tabular-nums" aria-label={`当前缩放 ${Math.round(zoom * 100)}%`}>
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
        options.vaultId, canvasId,
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
  }, [canvasId, options.vaultId, revision])

  useEffect(() => window.electronAPI.knowledge.onChanged((event) => {
    if (event.vaultId === options.vaultId && event.resourceType === 'canvas' &&
        event.resourceId === canvasId) setRevision((value) => value + 1)
  }), [canvasId, options.vaultId])

  useEffect(() => {
    const editorDom = editor?.view?.dom
    if (!editorDom) return
    const reload = (event: Event) => {
      const detail = (event as CustomEvent<{ resourceType: string; resourceId: string }>).detail
      if (detail?.resourceType === 'canvas' && detail.resourceId === canvasId) {
        setRevision((value) => value + 1)
      }
    }
    editorDom.addEventListener('localkb:resource-preview-reload', reload)
    return () => editorDom.removeEventListener('localkb:resource-preview-reload', reload)
  }, [canvasId, editor])

  return (
    <ReferenceShell
      width={width}
      height={height}
      textAlign={textAlign}
      selected={selected}
      resizeHeight
      updateAttributes={updateAttributes}
      onResize={fitAfterFrameResize}
      interaction={options.interaction}
      nodeType="canvasReference"
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
            minScale={0.05}
            maxScale={MAX_ZOOM}
            limitToBounds={false}
            centerZoomedOut={false}
            wheel={{ step: ZOOM_STEP, wheelDisabled: true }}
            trackPadPanning={{ disabled: true }}
            doubleClick={{ disabled: true }}
            panning={{ velocityDisabled: true }}
            onInit={(transform) => {
              transformRef.current = transform
              requestAnimationFrame(fit)
            }}
            onTransform={(_ref, state) => setZoom(state.scale)}
            onPanningStart={() => {
              manuallyAdjustedRef.current = true
              options.interaction?.beginGesture('resourcePanning', 'canvasReference')
            }}
            onPanningStop={() => options.interaction?.endGesture('resourcePanning')}
            onWheelStart={() => {
              manuallyAdjustedRef.current = true
              options.interaction?.beginGesture('resourcePanning', 'canvasReference')
            }}
            onWheelStop={() => options.interaction?.endGesture('resourcePanning')}
            onPinchStart={() => {
              manuallyAdjustedRef.current = true
              options.interaction?.beginGesture('resourcePanning', 'canvasReference')
            }}
            onPinchStop={() => options.interaction?.endGesture('resourcePanning')}
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
      {status === 'loading' && <div className="resource-preview-status absolute inset-0 grid place-items-center text-sm">正在加载画布…</div>}
      {status === 'missing' && <div className="resource-preview-status is-error absolute inset-0 grid place-items-center px-8 text-center text-sm">画布资源不存在，双击可恢复编辑</div>}
      {status === 'error' && (
        <button type="button" className="resource-preview-status is-error absolute inset-0 text-sm" onClick={() => setRevision((value) => value + 1)}>
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
  const fitRef = useRef<(() => void) | null>(null)
  return (
    <ReferenceShell
      width={width}
      height={height}
      textAlign={textAlign}
      selected={selected}
      resizeHeight
      updateAttributes={updateAttributes}
      onResize={() => fitRef.current?.()}
      interaction={options.interaction}
      nodeType="mindmapReference"
      onSelect={() => {
        const position = getPos()
        if (typeof position === 'number') editor.chain().focus().setNodeSelection(position).run()
      }}
      onDoubleClick={() => options.onEdit(mindmapId)}
    >
      <MindMapPreview
        vaultId={options.vaultId}
        mindmapId={mindmapId}
        selected={selected}
        interaction={options.interaction}
        editorDom={editor?.view?.dom}
        fitRef={fitRef}
      />
    </ReferenceShell>
  )
}

function AssetImageView({ node, updateAttributes, selected, extension, editor, getPos }: any) {
  const options = extension.options as ResourceOptions
  const { assetId, width, textAlign, alt } = node.attrs as {
    assetId: string; width: number | null; textAlign: Alignment; alt: string | null
  }
  const [failed, setFailed] = useState(false)
  const src = `localkb-resource://asset/${encodeURIComponent(options.vaultId)}/${encodeURIComponent(assetId)}`
  return (
    <ReferenceShell
      width={width}
      textAlign={textAlign}
      selected={selected}
      updateAttributes={updateAttributes}
      interaction={options.interaction}
      nodeType="assetImage"
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
        <img
          src={src}
          alt={alt ?? ''}
          draggable={false}
          className="block h-auto w-full"
          onError={() => setFailed(true)}
        />
      )}
    </ReferenceShell>
  )
}

function referenceIdAttribute(attributeName: string, htmlAttribute: string) {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute(htmlAttribute),
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[attributeName]
      return typeof value === 'string' && value.length > 0
        ? { [htmlAttribute]: value }
        : {}
    },
  }
}

function presentationSizeAttribute(attributeName: 'width' | 'height') {
  const htmlAttribute = `data-${attributeName}`
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(htmlAttribute)
      if (raw === null) return null
      const value = Number(raw)
      return Number.isFinite(value) && value > 0 ? value : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[attributeName]
      return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? { [htmlAttribute]: String(value) }
        : {}
    },
  }
}

const textAlignAttribute = {
  default: 'left',
  parseHTML: (element: HTMLElement): Alignment => {
    const value = element.getAttribute('data-text-align')
    return value === 'center' || value === 'right' ? value : 'left'
  },
  renderHTML: (attributes: Record<string, unknown>) => ({
    'data-text-align': attributes.textAlign === 'center' || attributes.textAlign === 'right'
      ? String(attributes.textAlign)
      : 'left',
  }),
}

const altAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute('alt'),
  renderHTML: (attributes: Record<string, unknown>) => ({
    alt: typeof attributes.alt === 'string' ? attributes.alt : '',
  }),
}

const presentationAttributes = {
  width: presentationSizeAttribute('width'),
  textAlign: textAlignAttribute,
}

const previewPresentationAttributes = {
  ...presentationAttributes,
  height: presentationSizeAttribute('height'),
}

function referencePresentationHtml(attributes: Record<string, unknown>): Record<string, string> {
  const width = typeof attributes.width === 'number' ? `max-width:${attributes.width}px;` : 'max-width:640px;'
  const height = typeof attributes.height === 'number' ? `height:${attributes.height}px;` : ''
  const align = attributes.textAlign === 'center'
    ? 'margin-left:auto;margin-right:auto;'
    : attributes.textAlign === 'right' ? 'margin-left:auto;' : 'margin-right:auto;'
  return {
    style: `${width}${height}${align}`,
  }
}

export const CanvasReference = Node.create<ResourceOptions>({
  name: TIPTAP_REFERENCE_NODE_TYPES.canvas, group: 'block', atom: true, draggable: false,
  addOptions: () => ({ vaultId: '', onEdit: () => undefined, interaction: undefined }),
  addAttributes: () => ({
    canvasId: referenceIdAttribute('canvasId', 'data-canvas-id'),
    ...previewPresentationAttributes,
  }),
  parseHTML: () => [{ tag: 'div[data-canvas-reference]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['div', mergeAttributes(
    { 'data-canvas-reference': '' },
    HTMLAttributes,
    referencePresentationHtml(node.attrs),
  )],
  renderMarkdown: renderManifestResourceMarkdown,
  addNodeView: () => ReactNodeViewRenderer(CanvasReferenceView, { stopEvent: stopInteractiveResourceEvent }),
})

export const MindMapReference = Node.create<ResourceOptions>({
  name: TIPTAP_REFERENCE_NODE_TYPES.mindmap, group: 'block', atom: true, draggable: false,
  addOptions: () => ({ vaultId: '', onEdit: () => undefined, interaction: undefined }),
  addAttributes: () => ({
    mindmapId: referenceIdAttribute('mindmapId', 'data-mindmap-id'),
    ...previewPresentationAttributes,
  }),
  parseHTML: () => [{ tag: 'div[data-mindmap-reference]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['div', mergeAttributes(
    { 'data-mindmap-reference': '' },
    HTMLAttributes,
    referencePresentationHtml(node.attrs),
  )],
  renderMarkdown: renderManifestResourceMarkdown,
  addNodeView: () => ReactNodeViewRenderer(MindMapReferenceView, { stopEvent: stopInteractiveResourceEvent }),
})

export const AssetImage = Node.create<Omit<ResourceOptions, 'onEdit'>>({
  name: TIPTAP_REFERENCE_NODE_TYPES.asset, group: 'block', atom: true, draggable: false,
  addOptions: () => ({ vaultId: '', interaction: undefined }),
  addAttributes: () => ({
    assetId: referenceIdAttribute('assetId', 'data-asset-id'),
    alt: altAttribute,
    ...presentationAttributes,
  }),
  parseHTML: () => [{ tag: 'img[data-asset-id]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['img', mergeAttributes(
    { 'data-asset-image': '' },
    HTMLAttributes,
    referencePresentationHtml(node.attrs),
  )],
  renderMarkdown: renderManifestResourceMarkdown,
  addNodeView: () => ReactNodeViewRenderer(AssetImageView, { stopEvent: stopInteractiveResourceEvent }),
})
