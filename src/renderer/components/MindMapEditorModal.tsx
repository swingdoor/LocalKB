import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow, MindElixirInstance, NodeObj, Summary, Topic } from 'mind-elixir'
import type { MindMapData } from '@shared/knowledge-types'
import { toast } from 'sonner'
import { createEmptyMindMap, selectMindMapTarget, type MindMapSurface } from '../mindmap/mindElixirAdapter'
import { blobToDataUrl, renderMindMapStatic, type MindMapExportFormat } from '../mindmap/mindMapExport'
import {
  copyMindMapNodesById,
  createMindMapRelation,
  createMindMapSummaryByIds,
  editMindMapNodeById,
  findMindMapArrow,
  findMindMapSummary,
  insertMindMapNodeById,
  isContinuousSiblingSelection,
  moveMindMapNodeById,
  removeMindMapArrowById,
  removeMindMapNodesById,
  removeMindMapSummaryById,
  resolveMindMapTopics,
  setMindMapNodeExpandedById,
  updateMindMapArrowById,
  updateMindMapNodesById,
  updateMindMapSummaryStyle,
} from '../mindmap/mindMapCommands'
import { resolveMindMapCapabilities } from '../mindmap/mindMapCapabilities'
import type { MindMapOverlayKind, MindMapSelection } from '../mindmap/mindMapInteraction'
import { syncMindMapSummaryPresentation } from '../mindmap/mindMapSummaryPresentation'
import { syncMindMapArrowPresentation } from '../mindmap/mindMapArrowPresentation'
import MindMapNoteMarkers from './MindMapNoteMarkers'
import { MindMapEditorDialog } from './mindmap-editor/MindMapEditorDialog'
import { MindMapEngineHost, type MindMapEngineEvents } from './mindmap-editor/MindMapEngineHost'
import { MindMapFloatingLayer } from './mindmap-editor/MindMapFloatingLayer'
import { MindMapContextMenu, type MindMapContextActions } from './mindmap-editor/MindMapContextMenus'
import { MindMapToolbar, type MindMapToolbarActions } from './mindmap-editor/MindMapToolbar'
import { MindMapViewport, type MindMapViewportMode } from './mindmap-editor/MindMapViewport'
import { useMindMapEditorController } from './mindmap-editor/useMindMapEditorController'
import { useMindMapSaveCoordinator } from './mindmap-editor/useMindMapSaveCoordinator'

type ClipboardState = { nodeIds: string[]; cut: boolean } | null

interface MindMapEditorModalProps {
  mindmapData: MindMapData | null
  isOpen: boolean
  loading?: boolean
  resourceError?: string | null
  onSave: (data: MindMapData) => Promise<void>
  onClose: () => void
}

function topLevelNodeIds(topics: Topic[]): string[] {
  const selectedIds = new Set(topics.map((topic) => topic.nodeObj.id))
  return topics.filter((topic) => {
    let parent = topic.nodeObj.parent
    while (parent) {
      if (selectedIds.has(parent.id)) return false
      parent = parent.parent
    }
    return true
  }).map((topic) => topic.nodeObj.id)
}

function statusForPhase(phase: string): string {
  if (phase === 'saving') return '保存中'
  if (phase === 'ready-dirty') return '未保存'
  if (phase === 'ready-clean') return '已保存'
  if (phase === 'error') return '加载失败'
  return '加载中'
}

function MindMapEditorModal({ mindmapData, isOpen, loading = false, resourceError, onSave, onClose }: MindMapEditorModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<MindMapSurface | null>(null)
  const clipboardRef = useRef<ClipboardState>(null)
  const openedRef = useRef(false)
  const controller = useMindMapEditorController()
  const [surface, setSurface] = useState<MindMapSurface | null>(null)
  const [floatingPortal, setFloatingPortal] = useState<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [direction, setDirection] = useState<0 | 1 | 2 | 3>(2)
  const [compact, setCompact] = useState(false)
  const [focused, setFocused] = useState(false)
  const [mode, setMode] = useState<MindMapViewportMode>('select')
  const [engineRevision, setEngineRevision] = useState(0)

  const getData = useCallback(() => {
    const mind = surfaceRef.current?.instance
    return mind ? mind.getData() as unknown as MindMapData : null
  }, [])
  const handleCoordinatorError = useCallback((message: string | null) => setError(message), [])
  const {
    phase, reset: resetSave, ready: markReady, failLoad, requestClose,
    recordOperation, recordPersistentMutation, runApplicationAction,
  } = useMindMapSaveCoordinator({ isOpen, getData, onSave, onClose, onError: handleCoordinatorError })

  const ready = phase === 'ready-clean' || phase === 'ready-dirty' || phase === 'saving'
  const mind = surface?.instance ?? null
  const selection = controller.state.selection

  useEffect(() => { surfaceRef.current = surface }, [surface])

  useEffect(() => {
    if (isOpen && !openedRef.current) {
      openedRef.current = true
      surfaceRef.current = null
      setSurface(null)
      clipboardRef.current = null
      setError(null)
      setZoom(1)
      setDirection(2)
      setCompact(false)
      setFocused(false)
      setMode('select')
      setEngineRevision(0)
      controller.reset()
      resetSave()
    } else if (!isOpen && openedRef.current) {
      openedRef.current = false
      surfaceRef.current = null
      setSurface(null)
      controller.reset()
    }
  }, [controller.reset, isOpen, resetSave])

  useEffect(() => {
    if (!isOpen || loading || surfaceRef.current || !resourceError) return
    failLoad(resourceError)
  }, [failLoad, isOpen, loading, resourceError])

  useEffect(() => {
    if (!mind) return
    syncMindMapArrowPresentation(mind, selection.type === 'arrow' ? selection.id : null)
    syncMindMapSummaryPresentation(mind, selection.type === 'summary' ? selection.id : null)
  }, [engineRevision, mind, selection])

  useEffect(() => {
    if (!controller.state.overlay) mind?.container.focus({ preventScroll: true })
  }, [controller.state.overlay, mind])

  const engineEvents: MindMapEngineEvents = {
    onReady: (nextSurface) => {
      surfaceRef.current = nextSurface
      setSurface(nextSurface)
      setZoom(nextSurface.instance.scaleVal)
      setDirection(nextSurface.instance.direction)
      setCompact(nextSurface.instance.compact)
      controller.syncSelection({ type: 'none' })
      markReady()
    },
    onError: (cause) => failLoad(cause.message),
    onOperation: (operation) => {
      recordOperation(operation)
      if (operation.name === 'finishEdit' || operation.name === 'finishEditArrowLabel' || operation.name === 'finishEditSummary') {
        controller.finishOwner()
      }
    },
    onSelection: controller.syncSelection,
    onScale: setZoom,
    onDirection: (value) => setDirection(value as 0 | 1 | 2 | 3),
    onPersistentCompatibilityChange: recordPersistentMutation,
    onVisualChange: () => setEngineRevision((current) => current + 1),
  }

  const runViewAction = useCallback((command: (instance: MindElixirInstance) => unknown | Promise<unknown>) => {
    const instance = surfaceRef.current?.instance
    if (!instance || !ready) return
    void Promise.resolve(command(instance)).catch((cause) => {
      const message = cause instanceof Error ? cause.message : '操作失败'
      setError(message)
      toast.error(message)
    })
  }, [ready])

  const runAction = useCallback((command: (instance: MindElixirInstance) => unknown | Promise<unknown>) => {
    const instance = surfaceRef.current?.instance
    if (!instance || !ready) return
    void runApplicationAction(() => command(instance)).catch((cause) => {
      const message = cause instanceof Error ? cause.message : '操作失败'
      setError(message)
      toast.error(message)
    })
  }, [ready, runApplicationAction])

  const selectedTopics = useMemo(() => {
    if (!mind || selection.type !== 'nodes') return []
    return resolveMindMapTopics(mind, selection.ids) ?? []
  }, [engineRevision, mind, selection])
  const selectedNodes = selectedTopics.map((topic) => topic.nodeObj)
  const selectedArrow: Arrow | null = mind && selection.type === 'arrow' ? findMindMapArrow(mind, selection.id) : null
  const selectedSummary: Summary | null = mind && selection.type === 'summary' ? findMindMapSummary(mind, selection.id) : null
  const capabilities = resolveMindMapCapabilities({
    selection,
    rootId: mind?.nodeData.id ?? null,
    continuousSiblings: isContinuousSiblingSelection(selectedTopics),
    hasClipboard: Boolean(clipboardRef.current),
  })

  const addNode = (nodeId: string, insertion: 'child' | 'sibling-before' | 'sibling-after' | 'parent') => {
    runAction((instance) => insertMindMapNodeById(instance, nodeId, insertion))
  }
  const editNode = (nodeId: string) => runAction((instance) => editMindMapNodeById(instance, nodeId))
  const moveNode = (nodeId: string, next: 'up' | 'down') => runAction((instance) => moveMindMapNodeById(instance, nodeId, next))
  const deleteNodes = (ids: string[]) => runAction((instance) => removeMindMapNodesById(instance, ids))
  const deleteArrow = (id: string) => runAction((instance) => removeMindMapArrowById(instance, id))
  const deleteSummary = (id: string) => runAction((instance) => removeMindMapSummaryById(instance, id))
  const patchNodes = (ids: string[], patch: (node: NodeObj) => Partial<NodeObj>) => runAction((instance) => updateMindMapNodesById(instance, ids, patch))
  const patchArrow = (id: string, patch: Partial<Arrow>) => runAction((instance) => updateMindMapArrowById(instance, id, patch))
  const patchSummary = (id: string, patch: { stroke?: string; labelColor?: string }) => runAction((instance) => updateMindMapSummaryStyle(instance, id, patch))

  const deleteTarget = (target: MindMapSelection) => {
    if (target.type === 'nodes') deleteNodes(target.ids)
    else if (target.type === 'arrow') deleteArrow(target.id)
    else if (target.type === 'summary') deleteSummary(target.id)
  }

  const deleteSelection = () => deleteTarget(controller.stateRef.current.selection)

  const copyNodes = (ids: string[], cut: boolean) => {
    const instance = surfaceRef.current?.instance
    const topics = instance ? resolveMindMapTopics(instance, ids) : null
    if (!instance || !topics?.length || topics.some((topic) => topic.nodeObj.id === instance.nodeData.id)) return
    clipboardRef.current = { nodeIds: topLevelNodeIds(topics), cut }
    setEngineRevision((current) => current + 1)
  }

  const pasteToNode = (nodeId: string) => {
    const clipboard = clipboardRef.current
    if (!clipboard) return
    runAction(async (instance) => {
      const copied = await copyMindMapNodesById(instance, clipboard.nodeIds, nodeId)
      if (!copied || !clipboard.cut) return
      await removeMindMapNodesById(instance, clipboard.nodeIds)
      clipboardRef.current = null
    })
  }

  const toggleFocus = (nodeId: string) => runViewAction((instance) => {
    if (focused) {
      instance.cancelFocus()
      setFocused(false)
      return
    }
    const topic = resolveMindMapTopics(instance, [nodeId])?.[0]
    if (topic) { instance.focusNode(topic); setFocused(true) }
  })

  const startRelation = (nodeId: string, bidirectional: boolean) => controller.startWorkflow({
    kind: 'create-relation', sourceId: nodeId, bidirectional, hoverNodeId: null, pointer: null,
  })

  const startReconnect = (arrowId: string, endpoint: 'from' | 'to') => {
    const arrow = surfaceRef.current?.instance ? findMindMapArrow(surfaceRef.current.instance, arrowId) : null
    if (!arrow) return
    controller.startWorkflow({
      kind: 'reconnect-arrow', arrowId, endpoint,
      fixedNodeId: endpoint === 'from' ? arrow.to : arrow.from,
      hoverNodeId: null, pointer: null,
    })
  }

  const updateWorkflow = (nodeId: string | null, pointer: { x: number; y: number } | null) => {
    const owner = controller.stateRef.current.owner
    if (owner.type !== 'workflow') return
    const workflow = owner.workflow
    const invalid = !nodeId || (workflow.kind === 'create-relation' ? nodeId === workflow.sourceId : nodeId === workflow.fixedNodeId)
    controller.updateWorkflow(invalid ? null : nodeId, pointer)
  }

  const finishWorkflow = (nodeId: string | null) => {
    const owner = controller.stateRef.current.owner
    if (owner.type !== 'workflow') return
    const workflow = owner.workflow
    if (nodeId && workflow.kind === 'create-relation' && nodeId !== workflow.sourceId) {
      runAction((instance) => {
        const arrow = createMindMapRelation(instance, workflow.sourceId, nodeId, workflow.bidirectional)
        if (arrow) selectMindMapTarget(instance, { type: 'arrow', id: arrow.id })
      })
    } else if (nodeId && workflow.kind === 'reconnect-arrow' && nodeId !== workflow.fixedNodeId) {
      runAction((instance) => updateMindMapArrowById(instance, workflow.arrowId, { [workflow.endpoint]: nodeId }))
    }
    controller.finishOwner()
  }

  const createSummary = (ids: string[]) => runAction((instance) => createMindMapSummaryByIds(instance, ids))
  const editArrow = (id: string) => runViewAction((instance) => {
    selectMindMapTarget(instance, { type: 'arrow', id })
    if (instance.currentArrow) instance.editArrowLabel(instance.currentArrow)
  })
  const editSummary = (id: string) => runViewAction((instance) => {
    selectMindMapTarget(instance, { type: 'summary', id })
    if (instance.currentSummary) instance.editSummary(instance.currentSummary)
  })

  const openOverlay = (kind: MindMapOverlayKind, target = controller.stateRef.current.selection) => {
    controller.openOverlay(kind, target)
  }

  const openContextMenu = (target: MindMapSelection, clientPoint: { x: number; y: number }) => {
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuHeight = target.type === 'nodes' && target.ids.length === 1 ? 480 : 240
    const x = Math.max(8, Math.min(clientPoint.x - rect.left, rect.width - 232))
    const y = Math.max(56, Math.min(clientPoint.y - rect.top, rect.height - menuHeight - 8))
    controller.openOverlay('context-menu', target, { x, y })
  }

  const restoreSelectionAfterLayout = (instance: MindElixirInstance, change: () => void) => {
    const snapshot = controller.stateRef.current.selection
    change()
    selectMindMapTarget(instance, snapshot)
  }

  const toolbarActions: MindMapToolbarActions = {
    undo: () => runAction((instance) => {
      const before = instance.getDataString(); instance.undo()
      if (instance.getDataString() !== before) recordPersistentMutation()
    }),
    redo: () => runAction((instance) => {
      const before = instance.getDataString(); instance.redo()
      if (instance.getDataString() !== before) recordPersistentMutation()
    }),
    addChild: (id) => addNode(id, 'child'),
    addSiblingBefore: (id) => addNode(id, 'sibling-before'),
    addSiblingAfter: (id) => addNode(id, 'sibling-after'),
    editNode,
    deleteSelection: deleteTarget,
    patchNodes,
    patchNodeMetadata: (id, patch) => patchNodes([id], () => patch),
    startRelation,
    createSummary,
    editArrow,
    patchArrow,
    reconnectArrow: startReconnect,
    editSummary,
    patchSummary,
    changeDirection: (value) => runAction((instance) => restoreSelectionAfterLayout(instance, () => {
      const next = Number(value)
      if (next === 0) instance.initLeft()
      else if (next === 1) instance.initRight()
      else if (next === 3) instance.initDown()
      else instance.initSide()
    })),
    toggleCompact: (next) => runAction((instance) => restoreSelectionAfterLayout(instance, () => {
      instance.changeCompact(next); setCompact(next); recordPersistentMutation()
    })),
    expandSelection: (nodeId, expanded) => runAction((instance) => setMindMapNodeExpandedById(instance, nodeId, expanded)),
    expandAll: (expanded) => runAction((instance) => instance.expandNodeAll(instance.findEle(instance.nodeData.id), expanded)),
    zoomBy: (delta) => runViewAction((instance) => instance.scale(Math.max(0.2, Math.min(3, instance.scaleVal + delta)))),
    resetZoom: () => runViewAction((instance) => instance.scale(1)),
    fit: () => runViewAction((instance) => instance.scaleFit()),
    setMode,
    exportStatic: (format: MindMapExportFormat) => runViewAction(async (instance) => {
      const blob = await renderMindMapStatic(instance.getData() as unknown as MindMapData, format)
      await window.electronAPI.file.downloadImage(await blobToDataUrl(blob), `思维导图.${format}`)
    }),
    openOverlay: (kind) => openOverlay(kind),
    closeOverlay: controller.closeOverlay,
  }

  const contextActions: MindMapContextActions = {
    addChild: (id) => addNode(id, 'child'),
    addSiblingBefore: (id) => addNode(id, 'sibling-before'),
    addSiblingAfter: (id) => addNode(id, 'sibling-after'),
    insertParent: (id) => addNode(id, 'parent'),
    editNode,
    moveNode,
    copyNodes,
    pasteToNode,
    toggleFocus,
    createRelation: startRelation,
    createSummary,
    deleteNodes,
    openNodeStyle: (target) => openOverlay('node-style', target),
    openNodeMetadata: (target) => openOverlay('node-metadata', target),
    editArrow,
    toggleArrowDirection: (id) => {
      const arrow = surfaceRef.current?.instance ? findMindMapArrow(surfaceRef.current.instance, id) : null
      if (arrow) patchArrow(id, { bidirectional: !arrow.bidirectional })
    },
    reconnectArrow: startReconnect,
    openArrowStyle: (target) => openOverlay('arrow-style', target),
    deleteArrow,
    editSummary,
    openSummaryStyle: (target) => openOverlay('summary-style', target),
    deleteSummary,
  }

  type KeyCommand = Parameters<React.ComponentProps<typeof MindMapViewport>['onKeyCommand']>[0]
  const handleKeyCommand = (command: KeyCommand) => {
    const current = controller.stateRef.current.selection
    if (current.type !== 'nodes' || current.ids.length !== 1) return
    const id = current.ids[0]
    if (command === 'add-child' && capabilities.canAddChild) addNode(id, 'child')
    else if (command === 'add-sibling-before' && capabilities.canAddSibling) addNode(id, 'sibling-before')
    else if (command === 'add-sibling-after' && capabilities.canAddSibling) addNode(id, 'sibling-after')
    else if (command === 'insert-parent' && capabilities.canInsertParent) addNode(id, 'parent')
    else if (command === 'edit' && capabilities.canEditText) editNode(id)
    else if (command === 'move-up' && capabilities.canMoveNode) moveNode(id, 'up')
    else if (command === 'move-down' && capabilities.canMoveNode) moveNode(id, 'down')
  }

  const overlay = controller.state.overlay
  const contextTarget = overlay?.kind === 'context-menu' ? overlay.target : null
  const openNoteId = overlay?.kind === 'note' && overlay.target.type === 'nodes' && overlay.target.ids.length === 1
    ? overlay.target.ids[0]
    : null
  const contextCapabilities = contextTarget ? resolveMindMapCapabilities({
    selection: contextTarget,
    rootId: mind?.nodeData.id ?? null,
    continuousSiblings: contextTarget.type === 'nodes' && Boolean(mind && isContinuousSiblingSelection(resolveMindMapTopics(mind, contextTarget.ids) ?? [])),
    hasClipboard: Boolean(clipboardRef.current),
  }) : null

  const dialogPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!controller.stateRef.current.overlay) return
    const target = event.target
    if (target instanceof Element && target.closest('[data-mindmap-floating-control]')) return
    controller.closeOverlay()
  }

  const finishPointerSequence = (pointerId: number) => {
    const owner = controller.stateRef.current.owner
    if (owner.type === 'viewport' && owner.pointerId === pointerId) controller.finishOwner()
    else if (owner.type === 'engine-native' && owner.pointerId === pointerId
      && (owner.gesture === 'node-drag' || owner.gesture === 'arrow-reshape')) controller.finishOwner()
  }

  const shouldMountEngine = isOpen && !loading && (!resourceError || Boolean(mindmapData))

  return <MindMapEditorDialog
    open={isOpen}
    status={statusForPhase(phase)}
    error={error || (!surface && resourceError) || null}
    onRequestClose={requestClose}
    onPointerDownCapture={dialogPointerDownCapture}
  >
    <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col bg-background">
      <MindMapToolbar
        ready={ready} selection={selection} capabilities={capabilities}
        nodes={selectedNodes} arrow={selectedArrow} summary={selectedSummary}
        direction={direction} compact={compact} zoom={zoom} mode={mode}
        overlayKind={overlay?.kind ?? null} floatingPortal={floatingPortal} actions={toolbarActions}
      />
      <MindMapViewport
        instance={mind} ready={ready} mode={mode} interaction={controller.state}
        visualRevision={engineRevision} floatingPortal={floatingPortal}
        engine={<>
          {shouldMountEngine && <MindMapEngineHost data={mindmapData ?? createEmptyMindMap()} events={engineEvents} />}
          {(phase === 'loading' || loading) && <div className="absolute inset-0 z-40 grid place-items-center bg-background/90 text-sm text-muted-foreground">正在加载思维导图…</div>}
          {phase === 'error' && <div className="absolute inset-0 z-40 grid place-items-center bg-background/95 px-8 text-center text-sm text-destructive">{error || resourceError || '思维导图加载失败，请关闭后重试'}</div>}
        </>}
        notes={(viewport, portal, revision) => <MindMapNoteMarkers
          instance={mind}
          viewportContainer={viewport}
          portalContainer={portal}
          revision={revision}
          openNoteId={openNoteId}
          onNoteOpenChange={(nodeId, open) => {
            if (open) {
              if (mind) selectMindMapTarget(mind, { type: 'nodes', ids: [nodeId] })
              controller.openOverlay('note', { type: 'nodes', ids: [nodeId] })
            }
            else if (controller.stateRef.current.overlay?.kind === 'note') controller.closeOverlay()
          }}
        />}
        onStartOwner={controller.startOwner} onFinishOwner={controller.finishOwner}
        onPointerSequenceEnd={finishPointerSequence}
        onOpenContextMenu={openContextMenu} onCloseOverlay={controller.closeOverlay}
        onUpdateWorkflow={updateWorkflow} onFinishWorkflow={finishWorkflow}
        onDeleteSelection={deleteSelection} onKeyCommand={handleKeyCommand}
      />
      <MindMapFloatingLayer ref={setFloatingPortal}>
        {contextTarget && contextCapabilities && overlay?.point && <MindMapContextMenu
          selection={contextTarget} capabilities={contextCapabilities} point={overlay.point}
          focused={focused} actions={contextActions} onDismiss={controller.closeOverlay}
        />}
      </MindMapFloatingLayer>
    </div>
  </MindMapEditorDialog>
}

export default MindMapEditorModal
