import { useCallback, useReducer, useRef } from 'react'
import {
  INITIAL_MIND_MAP_INTERACTION_STATE,
  mindMapInteractionReducer,
  targetSnapshot,
  type MindMapInteractionOwner,
  type MindMapInteractionState,
  type MindMapOverlayKind,
  type MindMapSelection,
  type MindMapWorkflow,
} from '../../mindmap/mindMapInteraction'

export function useMindMapEditorController() {
  const [state, dispatch] = useReducer(mindMapInteractionReducer, INITIAL_MIND_MAP_INTERACTION_STATE)
  const stateRef = useRef<MindMapInteractionState>(state)
  stateRef.current = state

  const syncSelection = useCallback((selection: MindMapSelection) => {
    dispatch({ type: 'selection-synced', selection })
  }, [])

  const openOverlay = useCallback((
    kind: MindMapOverlayKind,
    target: MindMapSelection,
    point?: { x: number; y: number },
  ) => {
    const snapshot = targetSnapshot(target)
    if (!snapshot) return false
    dispatch({
      type: 'open-overlay',
      overlay: { kind, target: snapshot, returnSelection: snapshot, point },
    })
    return true
  }, [])

  const closeOverlay = useCallback(() => dispatch({ type: 'close-overlay' }), [])
  const startOwner = useCallback((owner: MindMapInteractionOwner) => dispatch({ type: 'start-owner', owner }), [])
  const finishOwner = useCallback(() => dispatch({ type: 'finish-owner' }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  const startWorkflow = useCallback((workflow: MindMapWorkflow) => {
    dispatch({ type: 'start-owner', owner: { type: 'workflow', workflow } })
  }, [])

  const updateWorkflow = useCallback((hoverNodeId: string | null, pointer: { x: number; y: number } | null) => {
    dispatch({ type: 'update-workflow', hoverNodeId, pointer })
  }, [])

  return {
    state,
    stateRef,
    syncSelection,
    openOverlay,
    closeOverlay,
    startOwner,
    finishOwner,
    startWorkflow,
    updateWorkflow,
    reset,
  }
}
