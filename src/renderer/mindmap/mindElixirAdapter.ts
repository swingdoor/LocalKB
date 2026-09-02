import MindElixir from 'mind-elixir'
import 'mind-elixir/style.css'
import type {
  Arrow,
  ArrowSvg,
  EventMap,
  KeypressOptions,
  MindElixirData,
  MindElixirInstance,
  Options,
  SummarySvg,
  Topic,
} from 'mind-elixir'
import type { MindMapData } from '@shared/knowledge-types'
import type { ApplicationTheme } from '@shared/types'
import { JIJIAN_MIND_MAP_EXPORT_THEME, getMindMapScreenTheme } from './mindElixirTheme'
import { syncMindMapSummaryPresentation } from './mindMapSummaryPresentation'
import type { MindMapSelection } from './mindMapInteraction'
import { findRenderedMindMapArrow, findRenderedMindMapSummary } from './mindMapHitTest'

export type MindMapSurfaceMode = 'editable' | 'preview' | 'offscreen'

export interface MindMapSurface {
  instance: MindElixirInstance
  applyApplicationTheme: (theme: ApplicationTheme) => void
  dispose: () => void
}

export function createEmptyMindMap(topic = '中心主题'): MindMapData {
  return MindElixir.new(topic) as unknown as MindMapData
}

type ListenerEntry<K extends keyof EventMap = keyof EventMap> = {
  type: K
  handler: EventMap[K]
}

export interface CreateMindMapSurfaceOptions {
  mode: MindMapSurfaceMode
  applicationTheme?: ApplicationTheme
  direction?: 0 | 1 | 2 | 3
  compact?: boolean
  keypress?: boolean | KeypressOptions
  handleWheel?: Options['handleWheel']
  listeners?: ListenerEntry[]
}

function cloneNativeData(data: MindMapData): MindElixirData {
  return structuredClone(data) as unknown as MindElixirData
}

export function createMindMapSurface(
  container: HTMLElement,
  data: MindMapData,
  options: CreateMindMapSurfaceOptions,
): MindMapSurface {
  if (!container.isConnected && options.mode !== 'offscreen') {
    throw new Error('思维导图容器尚未挂载')
  }

  container.replaceChildren()
  const editable = options.mode === 'editable'
  const persistedDirection = typeof data.direction === 'number' && [0, 1, 2, 3].includes(data.direction)
    ? data.direction as 0 | 1 | 2 | 3
    : undefined
  const persistedCompact = typeof data.compact === 'boolean' ? data.compact : undefined
  const initialTheme = options.mode === 'offscreen'
    ? JIJIAN_MIND_MAP_EXPORT_THEME
    : getMindMapScreenTheme(options.applicationTheme ?? 'classic')
  const instance = new MindElixir({
    el: container,
    editable,
    newTopicName: '新节点',
    keypress: editable ? (options.keypress ?? true) : false,
    mouseSelectionButton: 0,
    toolBar: false,
    contextMenu: false,
    allowUndo: editable,
    // Mind Elixir 5.15.1 only installs its native pointer controller when
    // overflowHidden is false. The editable viewport clips at the React shell,
    // so keep the engine controller enabled instead of reimplementing drag,
    // box selection and Space pan in React.
    overflowHidden: options.mode === 'preview',
    direction: options.direction ?? persistedDirection ?? MindElixir.SIDE,
    compact: options.compact ?? persistedCompact ?? false,
    theme: initialTheme,
    handleWheel: options.handleWheel,
    scaleMin: 0.2,
    scaleMax: 3,
  })

  let disposed = false
  const registered: ListenerEntry[] = []
  try {
    const error = instance.init(cloneNativeData(data))
    if (error) throw error
    instance.changeTheme(initialTheme, false)
    syncMindMapSummaryPresentation(instance, null)
    if (editable) instance.clearHistory?.()
    for (const listener of options.listeners ?? []) {
      instance.bus.addListener(listener.type, listener.handler)
      registered.push(listener)
    }
  } catch (error) {
    instance.destroy()
    container.replaceChildren()
    throw error
  }

  return {
    instance,
    applyApplicationTheme: (theme) => {
      if (disposed || options.mode === 'offscreen') return
      instance.changeTheme(getMindMapScreenTheme(theme), false)
      syncMindMapSummaryPresentation(instance, null)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const listener of registered) {
        instance.bus?.removeListener(listener.type, listener.handler)
      }
      instance.destroy()
      container.replaceChildren()
    },
  }
}

export function createEditableMindMap(
  container: HTMLElement,
  data: MindMapData,
  options: Omit<CreateMindMapSurfaceOptions, 'mode'> = {},
): MindMapSurface {
  return createMindMapSurface(container, data, { ...options, mode: 'editable' })
}

export function createReadOnlyMindMap(
  container: HTMLElement,
  data: MindMapData,
  options: Omit<CreateMindMapSurfaceOptions, 'mode'> = {},
): MindMapSurface {
  return createMindMapSurface(container, data, { ...options, mode: 'preview' })
}

export function createOffscreenMindMap(
  container: HTMLElement,
  data: MindMapData,
  options: Omit<CreateMindMapSurfaceOptions, 'mode'> = {},
): MindMapSurface {
  return createMindMapSurface(container, data, { ...options, mode: 'offscreen' })
}

export function findMindMapTopic(instance: MindElixirInstance, nodeId: string): Topic | null {
  try {
    const topic = instance.findEle(nodeId)
    return topic?.nodeObj?.id === nodeId ? topic : null
  } catch {
    return null
  }
}

export function selectionFromMindElixir(instance: MindElixirInstance): MindMapSelection {
  if (instance.currentArrow?.arrowObj?.id) return { type: 'arrow', id: instance.currentArrow.arrowObj.id }
  if (instance.currentSummary?.summaryObj?.id) return { type: 'summary', id: instance.currentSummary.summaryObj.id }
  const ids = instance.currentNodes.map((topic) => topic.nodeObj.id)
  return ids.length > 0 ? { type: 'nodes', ids } : { type: 'none' }
}

export function selectMindMapTarget(instance: MindElixirInstance, selection: MindMapSelection): boolean {
  instance.clearSelection()
  if (selection.type === 'none') return true
  if (selection.type === 'nodes') {
    const topics = selection.ids.map((id) => findMindMapTopic(instance, id))
    if (topics.some((topic) => !topic)) return false
    instance.selectNodes(topics as Topic[])
    return true
  }
  if (selection.type === 'arrow') {
    const arrow = findRenderedMindMapArrow(instance, selection.id)
    if (!arrow) return false
    instance.selectArrow(arrow)
    return true
  }
  const summary = findRenderedMindMapSummary(instance, selection.id)
  if (!summary) return false
  instance.selectSummary(summary)
  return true
}

/**
 * Mind Elixir redraws and emits one operation when reshaping an arrow. Endpoint
 * changes additionally rebuild the native curve helpers because their closures
 * capture endpoint geometry when the arrow is selected.
 */
export function reshapeMindMapArrow(
  instance: MindElixirInstance,
  arrow: Arrow,
  patch: Partial<Arrow>,
  restoreSelection = false,
): ArrowSvg | null {
  const endpointChanged = patch.from !== undefined || patch.to !== undefined
  const selected = restoreSelection || instance.currentArrow?.arrowObj.id === arrow.id
  if (endpointChanged && instance.currentArrow?.arrowObj.id === arrow.id) instance.unselectArrow()
  instance.reshapeArrow(arrow, patch)
  const rendered = findRenderedMindMapArrow(instance, arrow.id)
  if (selected && rendered) {
    if (instance.currentArrow?.arrowObj.id !== arrow.id) instance.selectArrow(rendered)
  }
  return rendered
}

export function restoreMindMapSummarySelection(
  instance: MindElixirInstance,
  summaryId: string,
): SummarySvg | null {
  const rendered = findRenderedMindMapSummary(instance, summaryId)
  if (!rendered) return null
  instance.clearSelection()
  instance.selectSummary(rendered)
  return rendered
}

/**
 * Mind Elixir 5.15.1 wires curve helpers to pointerup/pointerleave but omits
 * pointercancel. Finishing the native helpers through their public handler
 * preserves a curve change already made and releases their internal session.
 */
export function finishMindMapArrowControl(instance: MindElixirInstance): void {
  const cancelledPointer = {} as PointerEvent
  if (instance.helper1?.pointerdown) instance.helper1.handleClear(cancelledPointer)
  if (instance.helper2?.pointerdown) instance.helper2.handleClear(cancelledPointer)
}
