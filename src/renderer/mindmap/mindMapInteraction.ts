export type MindMapSelection =
  | { type: 'none' }
  | { type: 'nodes'; ids: string[] }
  | { type: 'arrow'; id: string }
  | { type: 'summary'; id: string }

export type MindMapTargetSnapshot = Exclude<MindMapSelection, { type: 'none' }>

export type MindMapOverlayKind =
  | 'context-menu'
  | 'node-style'
  | 'node-metadata'
  | 'arrow-style'
  | 'summary-style'
  | 'note'

export interface MindMapOverlayState {
  kind: MindMapOverlayKind
  target: MindMapTargetSnapshot
  returnSelection: MindMapSelection
  point?: { x: number; y: number }
}

export type MindMapWorkflow =
  | {
    kind: 'create-relation'
    sourceId: string
    bidirectional: boolean
    hoverNodeId: string | null
    pointer: { x: number; y: number } | null
  }
  | {
    kind: 'reconnect-arrow'
    arrowId: string
    endpoint: 'from' | 'to'
    fixedNodeId: string
    hoverNodeId: string | null
    pointer: { x: number; y: number } | null
  }

export type MindMapInteractionOwner =
  | { type: 'selection' }
  | { type: 'viewport'; gesture: 'pan' | 'box-select'; pointerId: number }
  | {
    type: 'engine-native'
    gesture: 'node-drag' | 'node-text-edit' | 'arrow-reshape' | 'arrow-text-edit' | 'summary-text-edit'
    pointerId?: number
  }
  | { type: 'workflow'; workflow: MindMapWorkflow }
  | { type: 'overlay'; kind: MindMapOverlayKind }

export interface MindMapInteractionState {
  selection: MindMapSelection
  owner: MindMapInteractionOwner
  overlay: MindMapOverlayState | null
}

export type MindMapInteractionAction =
  | { type: 'selection-synced'; selection: MindMapSelection }
  | { type: 'open-overlay'; overlay: MindMapOverlayState }
  | { type: 'close-overlay' }
  | { type: 'start-owner'; owner: MindMapInteractionOwner }
  | { type: 'update-workflow'; hoverNodeId: string | null; pointer: { x: number; y: number } | null }
  | { type: 'finish-owner' }
  | { type: 'reset' }

export const EMPTY_MIND_MAP_SELECTION: MindMapSelection = { type: 'none' }

export const INITIAL_MIND_MAP_INTERACTION_STATE: MindMapInteractionState = {
  selection: EMPTY_MIND_MAP_SELECTION,
  owner: { type: 'selection' },
  overlay: null,
}

export function sameMindMapSelection(left: MindMapSelection, right: MindMapSelection): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'none' && right.type === 'none') return true
  if (left.type === 'nodes' && right.type === 'nodes') {
    return left.ids.length === right.ids.length && left.ids.every((id, index) => id === right.ids[index])
  }
  return 'id' in left && 'id' in right && left.id === right.id
}

export function mindMapInteractionReducer(
  state: MindMapInteractionState,
  action: MindMapInteractionAction,
): MindMapInteractionState {
  if (action.type === 'reset') return INITIAL_MIND_MAP_INTERACTION_STATE
  if (action.type === 'selection-synced') {
    if (sameMindMapSelection(state.selection, action.selection)) return state
    const keepsPointerOwner = state.owner.type === 'viewport' || state.owner.type === 'engine-native'
    return { selection: action.selection, owner: keepsPointerOwner ? state.owner : { type: 'selection' }, overlay: null }
  }
  if (action.type === 'open-overlay') {
    return { ...state, selection: action.overlay.target, owner: { type: 'overlay', kind: action.overlay.kind }, overlay: action.overlay }
  }
  if (action.type === 'close-overlay') {
    if (!state.overlay) return state
    return { selection: state.overlay.returnSelection, owner: { type: 'selection' }, overlay: null }
  }
  if (action.type === 'start-owner') {
    return { ...state, owner: action.owner, overlay: null }
  }
  if (action.type === 'update-workflow') {
    if (state.owner.type !== 'workflow') return state
    return {
      ...state,
      owner: {
        type: 'workflow',
        workflow: { ...state.owner.workflow, hoverNodeId: action.hoverNodeId, pointer: action.pointer },
      },
    }
  }
  if (action.type === 'finish-owner') {
    return { ...state, owner: { type: 'selection' }, overlay: null }
  }
  return state
}

export function targetSnapshot(selection: MindMapSelection): MindMapTargetSnapshot | null {
  if (selection.type === 'none') return null
  return selection.type === 'nodes' ? { type: 'nodes', ids: [...selection.ids] } : { ...selection }
}
