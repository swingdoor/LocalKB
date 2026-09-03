import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { MindElixirInstance } from 'mind-elixir'
import { classifyMindMapHit } from '../../mindmap/mindMapHitTest'
import { finishMindMapArrowControl, selectMindMapTarget } from '../../mindmap/mindElixirAdapter'
import type { MindMapInteractionState, MindMapSelection } from '../../mindmap/mindMapInteraction'

export type MindMapViewportMode = 'select' | 'pan'

export function MindMapViewport({
  instance,
  ready,
  mode,
  interaction,
  engine,
  visualRevision,
  floatingPortal,
  notes,
  onStartOwner,
  onFinishOwner,
  onPointerSequenceEnd,
  onOpenContextMenu,
  onCloseOverlay,
  onUpdateWorkflow,
  onFinishWorkflow,
  onDeleteSelection,
  onKeyCommand,
}: {
  instance: MindElixirInstance | null
  ready: boolean
  mode: MindMapViewportMode
  interaction: MindMapInteractionState
  engine: ReactNode
  visualRevision: number
  floatingPortal: HTMLElement | null
  notes: (viewport: HTMLElement | null, portal: HTMLElement | null, revision: number) => ReactNode
  onStartOwner: (owner: MindMapInteractionState['owner']) => void
  onFinishOwner: () => void
  onPointerSequenceEnd: (pointerId: number) => void
  onOpenContextMenu: (selection: MindMapSelection, clientPoint: { x: number; y: number }) => void
  onCloseOverlay: () => void
  onUpdateWorkflow: (nodeId: string | null, pointer: { x: number; y: number } | null) => void
  onFinishWorkflow: (nodeId: string | null) => void
  onDeleteSelection: () => void
  onKeyCommand: (command: 'add-child' | 'add-sibling-before' | 'add-sibling-after' | 'insert-parent' | 'edit' | 'move-up' | 'move-down') => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!instance || interaction.owner.type !== 'workflow') return
    const targetId = interaction.owner.workflow.hoverNodeId
    for (const topic of Array.from(instance.container.querySelectorAll<HTMLElement>('me-tpc'))) {
      topic.toggleAttribute('data-mindmap-workflow-target', topic.getAttribute('data-nodeid') === targetId || (topic as any).nodeObj?.id === targetId)
    }
    return () => {
      for (const topic of Array.from(instance.container.querySelectorAll<HTMLElement>('me-tpc'))) {
        topic.removeAttribute('data-mindmap-workflow-target')
      }
    }
  }, [instance, interaction.owner, visualRevision])

  useEffect(() => {
    if (!instance) return
    const cancel = () => {
      finishMindMapArrowControl(instance)
      instance.spacePressed = false
      instance.container.classList.remove('space-pressed')
      instance.panHelper.clear()
      onFinishOwner()
    }
    window.addEventListener('blur', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointercancel', cancel)
      instance.helper1?.clear()
      instance.helper2?.clear()
      instance.spacePressed = false
      instance.panHelper.clear()
      onFinishOwner()
    }
  }, [instance, onFinishOwner])

  const workflowLine = useMemo(() => {
    if (!instance || interaction.owner.type !== 'workflow' || !interaction.owner.workflow.pointer || !viewportRef.current) return null
    const workflow = interaction.owner.workflow
    const startId = workflow.kind === 'create-relation' ? workflow.sourceId : workflow.fixedNodeId
    let topic: HTMLElement | null = null
    try { topic = instance.findEle(startId) } catch { return null }
    const topicRect = topic.getBoundingClientRect()
    const viewportRect = viewportRef.current.getBoundingClientRect()
    return {
      x1: topicRect.left + topicRect.width / 2 - viewportRect.left,
      y1: topicRect.top + topicRect.height / 2 - viewportRect.top,
      x2: workflow.pointer.x,
      y2: workflow.pointer.y,
    }
  }, [instance, interaction.owner, visualRevision])

  const handlePointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!ready || !instance) return
    const hit = classifyMindMapHit(instance, event.target)
    if (!hit || hit.kind === 'floating-control') return

    if (event.button === 2) {
      event.preventDefault()
      event.stopPropagation()
      instance.panHelper.clear()
      const selection: MindMapSelection = hit.kind === 'node'
        ? { type: 'nodes', ids: [hit.id] }
        : hit.kind === 'arrow'
          ? { type: 'arrow', id: hit.id }
          : hit.kind === 'summary'
            ? { type: 'summary', id: hit.id }
            : { type: 'none' }
      if (selection.type === 'none') onCloseOverlay()
      else {
        selectMindMapTarget(instance, selection)
        onOpenContextMenu(selection, { x: event.clientX, y: event.clientY })
      }
      return
    }
    if (event.button !== 0) return

    if (interaction.owner.type === 'workflow') {
      event.preventDefault()
      event.stopPropagation()
      onFinishWorkflow(hit.kind === 'node' ? hit.id : null)
      return
    }
    if (hit.kind === 'native-text-editor') {
      const gesture = interaction.selection.type === 'arrow'
        ? 'arrow-text-edit'
        : interaction.selection.type === 'summary' ? 'summary-text-edit' : 'node-text-edit'
      onStartOwner({ type: 'engine-native', gesture, pointerId: event.pointerId })
      return
    }
    instance.container.focus({ preventScroll: true })
    if (hit.kind === 'arrow-control-handle') {
      onStartOwner({ type: 'engine-native', gesture: 'arrow-reshape', pointerId: event.pointerId })
      return
    }
    if (mode === 'pan' || instance.spacePressed) {
      if (mode === 'pan') {
        instance.spacePressed = true
        instance.container.classList.add('space-pressed')
      }
      onStartOwner({ type: 'viewport', gesture: 'pan', pointerId: event.pointerId })
      return
    }
    if (hit.kind === 'arrow' || hit.kind === 'summary') {
      event.preventDefault()
      event.stopPropagation()
      selectMindMapTarget(instance, hit.kind === 'arrow'
        ? { type: 'arrow', id: hit.id }
        : { type: 'summary', id: hit.id })
      return
    }
    if (hit.kind === 'node') {
      onStartOwner({ type: 'engine-native', gesture: 'node-drag', pointerId: event.pointerId })
      return
    }
    onStartOwner({ type: 'viewport', gesture: 'box-select', pointerId: event.pointerId })
  }

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!instance) return
    if (event.type === 'pointercancel') finishMindMapArrowControl(instance)
    instance.spacePressed = false
    instance.container.classList.remove('space-pressed')
    onPointerSequenceEnd(event.pointerId)
  }

  const handleDoubleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!ready || !instance) return
    const hit = classifyMindMapHit(instance, event.target)
    if (hit?.kind === 'arrow') {
      event.preventDefault(); event.stopPropagation()
      selectMindMapTarget(instance, { type: 'arrow', id: hit.id })
      onStartOwner({ type: 'engine-native', gesture: 'arrow-text-edit' })
      instance.editArrowLabel(hit.element)
    } else if (hit?.kind === 'summary') {
      event.preventDefault(); event.stopPropagation()
      selectMindMapTarget(instance, { type: 'summary', id: hit.id })
      onStartOwner({ type: 'engine-native', gesture: 'summary-text-edit' })
      instance.editSummary(hit.element)
    } else if (hit?.kind === 'node') {
      onStartOwner({ type: 'engine-native', gesture: 'node-text-edit' })
    }
  }

  const handlePointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!instance || interaction.owner.type !== 'workflow' || !viewportRef.current) return
    const hit = classifyMindMapHit(instance, event.target)
    const rect = viewportRef.current.getBoundingClientRect()
    onUpdateWorkflow(hit?.kind === 'node' ? hit.id : null, { x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  const handleBlurCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!instance || interaction.owner.type !== 'engine-native') return
    const gesture = interaction.owner.gesture
    if (gesture !== 'node-text-edit' && gesture !== 'arrow-text-edit' && gesture !== 'summary-text-edit') return
    if (classifyMindMapHit(instance, event.target)?.kind === 'native-text-editor') onFinishOwner()
  }

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest('#input-box,input,textarea,[contenteditable="true"]')) return
    if (event.key === 'Escape' && interaction.owner.type === 'workflow') {
      event.preventDefault(); event.stopPropagation(); onFinishWorkflow(null)
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.owner.type === 'selection') {
      event.preventDefault(); event.stopPropagation(); onDeleteSelection()
      return
    }
    if (interaction.owner.type !== 'selection') return
    let command: Parameters<typeof onKeyCommand>[0] | null = null
    if (event.key === 'Tab') command = 'add-child'
    else if (event.key === 'Enter') command = event.metaKey || event.ctrlKey ? 'insert-parent' : event.shiftKey ? 'add-sibling-before' : 'add-sibling-after'
    else if (event.key === 'F2') command = 'edit'
    else if (event.key === 'PageUp' || (event.altKey && event.key === 'ArrowUp')) command = 'move-up'
    else if (event.key === 'PageDown' || (event.altKey && event.key === 'ArrowDown')) command = 'move-down'
    if (command) {
      event.preventDefault()
      event.stopPropagation()
      onKeyCommand(command)
    }
  }

  return <div
    ref={viewportRef}
    data-mindmap-editor-surface=""
    className={`relative min-h-0 flex-1 overflow-hidden outline-none ${mode === 'pan' ? 'cursor-grab' : 'cursor-default'}`}
    style={{ backgroundColor: 'var(--resource-mindmap-surface)' }}
    tabIndex={0}
    onPointerDownCapture={handlePointerDownCapture}
    onPointerMoveCapture={handlePointerMoveCapture}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
    onDoubleClickCapture={handleDoubleClickCapture}
    onBlurCapture={handleBlurCapture}
    onContextMenuCapture={(event) => { event.preventDefault(); event.stopPropagation() }}
    onKeyDownCapture={handleKeyDownCapture}
  >
    {engine}
    <div className="pointer-events-none absolute inset-0 z-20" data-mindmap-visual-overlay="">
      {notes(viewportRef.current, floatingPortal, visualRevision)}
      {workflowLine && <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line {...workflowLine} stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="6 5" />
      </svg>}
      {interaction.owner.type === 'workflow' && <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border bg-background px-3 py-2 text-sm shadow">
        {interaction.owner.workflow.kind === 'create-relation' ? '请选择关联目标' : `请选择新的${interaction.owner.workflow.endpoint === 'from' ? '起点' : '终点'}`}，按 Esc 取消
      </div>}
    </div>
  </div>
}
