import { useLayoutEffect, useState } from 'react'
import type { MindElixirInstance, Topic } from 'mind-elixir'
import { MessageSquareText } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

interface MindMapNoteMarkersProps {
  instance: MindElixirInstance | null
  viewportContainer?: HTMLElement | null
  portalContainer: HTMLElement | null
  revision: number
  openNoteId?: string | null
  onNoteOpenChange?: (nodeId: string, open: boolean) => void
}

interface NoteMarker {
  id: string
  topic: string
  note: string
  left: number
  top: number
}

function sameMarkers(left: NoteMarker[], right: NoteMarker[]): boolean {
  return left.length === right.length && left.every((marker, index) => {
    const next = right[index]
    return marker.id === next.id
      && marker.topic === next.topic
      && marker.note === next.note
      && marker.left === next.left
      && marker.top === next.top
  })
}

export default function MindMapNoteMarkers({
  instance,
  viewportContainer,
  portalContainer,
  revision,
  openNoteId,
  onNoteOpenChange,
}: MindMapNoteMarkersProps) {
  const [markers, setMarkers] = useState<NoteMarker[]>([])
  const measurementContainer = viewportContainer ?? portalContainer

  useLayoutEffect(() => {
    const engineContainer = instance?.container
    if (!measurementContainer || !(engineContainer instanceof Element)) {
      setMarkers([])
      return
    }

    let active = true
    let frame: number | null = null
    const measure = () => {
      if (!active) return
      const containerRect = measurementContainer.getBoundingClientRect()
      const next = Array.from(engineContainer.querySelectorAll<Topic>('me-tpc'))
        .filter((topic) => Boolean(topic.nodeObj.note?.trim()))
        .map((topic) => {
          const rect = topic.getBoundingClientRect()
          return {
            id: topic.nodeObj.id,
            topic: topic.nodeObj.topic,
            note: topic.nodeObj.note!.trim(),
            left: Math.round(rect.right - containerRect.left + 3),
            top: Math.round(rect.top - containerRect.top - 5),
          }
        })
      setMarkers((current) => sameMarkers(current, next) ? current : next)
    }
    const schedule = () => {
      if (!active) return
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { frame = null; measure() })
    }
    const mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(engineContainer, { attributes: true, childList: true, subtree: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resizeObserver?.observe(measurementContainer)
    engineContainer.addEventListener('pointermove', schedule)
    engineContainer.addEventListener('wheel', schedule)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
      engineContainer.removeEventListener('pointermove', schedule)
      engineContainer.removeEventListener('wheel', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [instance, measurementContainer, revision])

  if (markers.length === 0) return null
  return <div className="mindmap-note-layer" data-mindmap-note-layer="">
    {markers.map((marker) => <Popover
      key={marker.id}
      open={onNoteOpenChange ? openNoteId === marker.id : undefined}
      onOpenChange={onNoteOpenChange ? (open) => onNoteOpenChange(marker.id, open) : undefined}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-mindmap-note-control=""
          data-mindmap-floating-control=""
          className="mindmap-note-marker"
          style={{ left: marker.left, top: marker.top }}
          aria-label={`查看“${marker.topic}”的备注`}
          title="查看备注"
        >
          <MessageSquareText aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent portalContainer={portalContainer} side="top" align="start" className="pointer-events-auto w-72 space-y-2" data-mindmap-floating-control="">
        <p className="text-sm font-medium">节点备注</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{marker.note}</p>
      </PopoverContent>
    </Popover>)}
  </div>
}
