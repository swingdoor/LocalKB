import { useEffect, useRef } from 'react'
import type { Arrow, MindElixirInstance, NodeObj, Operation, Summary } from 'mind-elixir'
import type { MindMapData } from '@shared/knowledge-types'
import {
  createEditableMindMap, selectionFromMindElixir, type MindMapSurface,
} from '../../mindmap/mindElixirAdapter'
import type { MindMapSelection } from '../../mindmap/mindMapInteraction'

export interface MindMapEngineEvents {
  onReady: (surface: MindMapSurface) => void
  onError: (error: Error) => void
  onOperation: (operation: Operation) => void
  onSelection: (selection: MindMapSelection) => void
  onScale: (value: number) => void
  onDirection: (value: number) => void
  onPersistentCompatibilityChange: () => void
  onVisualChange: () => void
}

export function MindMapEngineHost({ data, events }: { data: MindMapData; events: MindMapEngineEvents }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    let cancelled = false
    let frame = 0
    let attempts = 0
    let surface: MindMapSurface | null = null
    const initialize = () => {
      if (cancelled) return
      const host = hostRef.current
      const rect = host?.getBoundingClientRect()
      if (!host || !rect || rect.width <= 0 || rect.height <= 0) {
        attempts += 1
        if (attempts < 30) { frame = requestAnimationFrame(initialize); return }
        eventsRef.current.onError(new Error('思维导图编辑区域尚未准备好，请关闭后重试'))
        return
      }
      try {
        let instance: MindElixirInstance | null = null
        const syncSelection = () => {
          if (instance) eventsRef.current.onSelection(selectionFromMindElixir(instance))
        }
        surface = createEditableMindMap(host, data, {
          listeners: [
            { type: 'operation', handler: (operation: Operation) => { eventsRef.current.onOperation(operation); eventsRef.current.onVisualChange() } },
            { type: 'selectNewNode', handler: (_node: NodeObj) => syncSelection() },
            { type: 'selectNodes', handler: (_nodes: NodeObj[]) => syncSelection() },
            { type: 'unselectNodes', handler: (_nodes: NodeObj[]) => syncSelection() },
            { type: 'selectArrow', handler: (_arrow: Arrow) => { syncSelection(); eventsRef.current.onVisualChange() } },
            { type: 'unselectArrow', handler: () => { syncSelection(); eventsRef.current.onVisualChange() } },
            { type: 'selectSummary', handler: (_summary: Summary) => { syncSelection(); eventsRef.current.onVisualChange() } },
            { type: 'unselectSummary', handler: () => { syncSelection(); eventsRef.current.onVisualChange() } },
            { type: 'scale', handler: (value: number) => { eventsRef.current.onScale(value); eventsRef.current.onVisualChange() } },
            { type: 'move', handler: () => eventsRef.current.onVisualChange() },
            { type: 'linkDiv', handler: () => eventsRef.current.onVisualChange() },
            { type: 'updateArrowDelta', handler: () => eventsRef.current.onVisualChange() },
            { type: 'changeDirection', handler: (value: number) => { eventsRef.current.onDirection(value); eventsRef.current.onPersistentCompatibilityChange(); eventsRef.current.onVisualChange() } },
            { type: 'expandNode', handler: () => { eventsRef.current.onPersistentCompatibilityChange(); eventsRef.current.onVisualChange() } },
          ],
        })
        instance = surface.instance
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            if (cancelled || !surface) return
            try {
              surface.instance.scaleFit()
              eventsRef.current.onReady(surface)
            } catch (cause) {
              eventsRef.current.onError(cause instanceof Error ? cause : new Error('思维导图自适应失败'))
            }
          })
        })
      } catch (cause) {
        eventsRef.current.onError(cause instanceof Error ? cause : new Error('思维导图初始化失败'))
      }
    }
    frame = requestAnimationFrame(initialize)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      surface?.dispose()
    }
    // A mounted host represents one open editor session. Data and callback
    // updates must not recreate the native engine during save or UI changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={hostRef} data-mindmap-engine-host="" className="h-full w-full" />
}
