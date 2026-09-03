import {
  useCallback,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { Resizable } from 'react-resizable'
import type { ResizeCallbackData, ResizeHandleAxis } from 'react-resizable'

type ResizeEdge = 'east' | 'west'

interface ResizablePaneProps {
  children: ReactNode
  defaultWidth: number
  minWidth: number
  maxWidth: number
  resizeFrom: ResizeEdge
  storageKey: string
  separatorLabel: string
  className?: string
}

function clampWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)))
}

function readStoredWidth(storageKey: string, fallback: number, minWidth: number, maxWidth: number) {
  try {
    const stored = Number(window.localStorage.getItem(storageKey))
    if (Number.isFinite(stored) && stored > 0) return clampWidth(stored, minWidth, maxWidth)
  } catch {
    // localStorage 不可用时继续使用默认值。
  }
  return clampWidth(fallback, minWidth, maxWidth)
}

export function ResizablePane({
  children,
  defaultWidth,
  minWidth,
  maxWidth,
  resizeFrom,
  storageKey,
  separatorLabel,
  className = '',
}: ResizablePaneProps) {
  const [width, setWidth] = useState(() => readStoredWidth(
    storageKey,
    defaultWidth,
    minWidth,
    maxWidth,
  ))
  const axis: ResizeHandleAxis = resizeFrom === 'east' ? 'e' : 'w'

  const persistWidth = useCallback((nextWidth: number) => {
    const clamped = clampWidth(nextWidth, minWidth, maxWidth)
    setWidth(clamped)
    try {
      window.localStorage.setItem(storageKey, String(clamped))
    } catch {
      // 调整宽度本身仍然生效；仅跳过持久化。
    }
  }, [maxWidth, minWidth, storageKey])

  const handleResize = useCallback((_event: SyntheticEvent, data: ResizeCallbackData) => {
    setWidth(clampWidth(data.size.width, minWidth, maxWidth))
  }, [maxWidth, minWidth])

  const handleResizeStop = useCallback((_event: SyntheticEvent, data: ResizeCallbackData) => {
    persistWidth(data.size.width)
  }, [persistWidth])

  const handleSeparatorKeyDown = useCallback((event: KeyboardEvent<HTMLSpanElement>) => {
    let nextWidth: number | null = null
    if (event.key === 'Home') nextWidth = minWidth
    else if (event.key === 'End') nextWidth = maxWidth
    else if (event.key === 'ArrowLeft') nextWidth = width + (resizeFrom === 'west' ? 12 : -12)
    else if (event.key === 'ArrowRight') nextWidth = width + (resizeFrom === 'east' ? 12 : -12)
    if (nextWidth === null) return
    event.preventDefault()
    persistWidth(nextWidth)
  }, [maxWidth, minWidth, persistWidth, resizeFrom, width])

  const renderHandle = useCallback((_axis: ResizeHandleAxis, ref: RefObject<HTMLElement>) => (
    <span
      ref={ref as RefObject<HTMLSpanElement>}
      role="separator"
      aria-label={separatorLabel}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      title="拖拽调整宽度"
      data-resize-edge={resizeFrom}
      className={`group absolute top-0 z-30 h-full w-[7px] cursor-col-resize outline-none ${
        resizeFrom === 'east' ? '-right-1' : '-left-1'
      }`}
      onKeyDown={handleSeparatorKeyDown}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
    </span>
  ), [handleSeparatorKeyDown, maxWidth, minWidth, resizeFrom, separatorLabel, width])

  return (
    <Resizable
      width={width}
      height={1}
      axis="x"
      resizeHandles={[axis]}
      minConstraints={[minWidth, 1]}
      maxConstraints={[maxWidth, 1]}
      handle={renderHandle}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      <div
        data-resizable-pane=""
        className={`relative h-full min-w-0 flex-none ${className}`}
        style={{ width: `${width}px` }}
      >
        {children}
      </div>
    </Resizable>
  )
}
