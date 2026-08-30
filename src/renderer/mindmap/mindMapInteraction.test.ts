import { describe, expect, it } from 'vitest'
import {
  INITIAL_MIND_MAP_INTERACTION_STATE, mindMapInteractionReducer, type MindMapInteractionState,
} from './mindMapInteraction'

describe('mindMapInteractionReducer', () => {
  it('keeps exactly one object selection and clears object-specific UI when it changes', () => {
    let state = mindMapInteractionReducer(INITIAL_MIND_MAP_INTERACTION_STATE, {
      type: 'selection-synced', selection: { type: 'nodes', ids: ['node-a', 'node-b'] },
    })
    state = mindMapInteractionReducer(state, {
      type: 'open-overlay',
      overlay: {
        kind: 'node-style', target: { type: 'nodes', ids: ['node-a', 'node-b'] },
        returnSelection: state.selection,
      },
    })
    expect(state.owner).toEqual({ type: 'overlay', kind: 'node-style' })

    state = mindMapInteractionReducer(state, {
      type: 'selection-synced', selection: { type: 'arrow', id: 'arrow-a' },
    })
    expect(state).toEqual({ selection: { type: 'arrow', id: 'arrow-a' }, owner: { type: 'selection' }, overlay: null })
  })

  it('makes a workflow exclusive and cancels it without clearing its source selection', () => {
    const selected: MindMapInteractionState = {
      selection: { type: 'nodes', ids: ['source'] }, owner: { type: 'selection' }, overlay: null,
    }
    let state = mindMapInteractionReducer(selected, {
      type: 'start-owner',
      owner: {
        type: 'workflow',
        workflow: { kind: 'create-relation', sourceId: 'source', bidirectional: false, hoverNodeId: null, pointer: null },
      },
    })
    expect(state.overlay).toBeNull()
    state = mindMapInteractionReducer(state, { type: 'finish-owner' })
    expect(state.selection).toEqual(selected.selection)
    expect(state.owner).toEqual({ type: 'selection' })
  })

  it('stores an overlay target snapshot independently of later arrays', () => {
    const ids = ['node-a']
    const state = mindMapInteractionReducer(INITIAL_MIND_MAP_INTERACTION_STATE, {
      type: 'open-overlay',
      overlay: {
        kind: 'context-menu', target: { type: 'nodes', ids: [...ids] },
        returnSelection: { type: 'nodes', ids: [...ids] }, point: { x: 12, y: 24 },
      },
    })
    ids.push('node-b')
    expect(state.overlay?.target).toEqual({ type: 'nodes', ids: ['node-a'] })
  })

  it('keeps pointer ownership while native selection events arrive and releases it only at sequence end', () => {
    let state = mindMapInteractionReducer(INITIAL_MIND_MAP_INTERACTION_STATE, {
      type: 'start-owner', owner: { type: 'viewport', gesture: 'pan', pointerId: 9 },
    })
    state = mindMapInteractionReducer(state, {
      type: 'selection-synced', selection: { type: 'nodes', ids: ['node-a'] },
    })
    expect(state.owner).toEqual({ type: 'viewport', gesture: 'pan', pointerId: 9 })
    state = mindMapInteractionReducer(state, { type: 'finish-owner' })
    expect(state.owner).toEqual({ type: 'selection' })
  })
})
