import { Editor, Node } from '@tiptap/core'
import { NodeRangeSelection } from '@tiptap/extension-node-range'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureMenuFocusTarget,
  createEditorInteractionCoordinator,
  preserveEditorSelectionOnPointerDown,
  resolveEditorMenuContext,
  restoreMenuFocusTarget,
} from './interactionContext'

const Atom = (name: string, inline = false) => Node.create({
  name,
  group: inline ? 'inline' : 'block',
  inline,
  atom: true,
  selectable: true,
  renderHTML: () => inline ? ['span', { [`data-${name}`]: '' }] : ['div', { [`data-${name}`]: '' }],
})

function createEditor(content: Record<string, unknown>): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Atom('image'),
      Atom('assetImage'),
      Atom('fileAttachment'),
      Atom('documentReference', true),
      Atom('canvasReference'),
      Atom('mindmapReference'),
    ],
    content,
  })
}

describe('resolveEditorMenuContext', () => {
  const editors: Editor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  const track = (editor: Editor) => {
    editors.push(editor)
    return editor
  }

  it('routes a non-empty TextSelection but not a cursor or code selection', () => {
    const editor = track(createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'plain' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] },
      ],
    }))
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'text-range', from: 1, to: 4,
    })

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'none', reason: 'cursor',
    })

    const codePos = editor.state.doc.child(0).nodeSize + 1
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, codePos, codePos + 2)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'none', reason: 'code-selection',
    })
  })

  it.each([
    ['image', 'image'],
    ['assetImage', 'asset-image'],
    ['fileAttachment', 'attachment'],
    ['canvasReference', 'canvas'],
    ['mindmapReference', 'mindmap'],
  ])('routes %s NodeSelection to only its own menu', (nodeType, menu) => {
    const editor = track(createEditor({ type: 'doc', content: [{ type: nodeType }] }))
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'node', nodeType, menu,
    })
  })

  it('routes inline documentReference without selecting its paragraph', () => {
    const editor = track(createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'documentReference' }] }],
    }))
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'node', nodeType: 'documentReference', menu: 'document-reference', pos: 1,
    })
  })

  it('rejects unknown NodeSelection and NodeRangeSelection without text fallback', () => {
    const editor = track(createEditor({
      type: 'doc',
      content: [{ type: 'horizontalRule' }, { type: 'paragraph', content: [{ type: 'text', text: 'next' }] }],
    }))
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'none', reason: 'unsupported-node:horizontalRule',
    })

    editor.view.dispatch(editor.state.tr.setSelection(NodeRangeSelection.create(editor.state.doc, 0, 2)))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({
      kind: 'none', reason: 'node-range-selection',
    })
  })

  it('gives CellSelection priority over table text state', () => {
    const editor = track(createEditor({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
          ],
        }],
      }],
    }))
    const cells: number[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos)
    })
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])))
    expect(resolveEditorMenuContext({ state: editor.state, phase: { kind: 'idle' } })).toMatchObject({ kind: 'table' })
  })

  it.each([
    [{ kind: 'modalOpen', source: 'picker' } as const, 'modal-open'],
    [{ kind: 'nodeResizing', nodeType: 'image' } as const, 'nodeResizing'],
    [{ kind: 'resourcePanning', nodeType: 'canvasReference' } as const, 'resourcePanning'],
  ])('suppresses selection while phase is $reason', (phase, reason) => {
    const editor = track(createEditor({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
    }))
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)))
    expect(resolveEditorMenuContext({ state: editor.state, phase })).toMatchObject({ kind: 'none', reason })
  })

})

describe('EditorInteractionCoordinator', () => {
  it('publishes synchronously and exits only the matching gesture', () => {
    const coordinator = createEditorInteractionCoordinator()
    const listener = vi.fn()
    coordinator.subscribe(listener)

    coordinator.beginGesture('nodeResizing', 'image')
    expect(coordinator.getSnapshot()).toEqual({ kind: 'nodeResizing', nodeType: 'image' })
    coordinator.endGesture('resourcePanning')
    expect(coordinator.getSnapshot().kind).toBe('nodeResizing')
    coordinator.endGesture('nodeResizing')
    expect(coordinator.getSnapshot()).toEqual({ kind: 'idle' })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps modal suppression until every modal source closes', () => {
    const coordinator = createEditorInteractionCoordinator()
    coordinator.setModalOpen('document-picker', true)
    coordinator.setModalOpen('canvas-editor', true)
    coordinator.setModalOpen('document-picker', false)
    expect(coordinator.getSnapshot()).toEqual({ kind: 'modalOpen', source: 'canvas-editor' })
    coordinator.setModalOpen('canvas-editor', false)
    expect(coordinator.getSnapshot()).toEqual({ kind: 'idle' })
  })
})

describe('menu focus contract', () => {
  it('restores the captured text range and prevents pointer focus theft', () => {
    const editor = createEditor({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain text' }] }],
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)))
    const target = captureMenuFocusTarget(editor)
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 8)))

    expect(restoreMenuFocusTarget(editor, target)).toBe(true)
    expect(editor.state.selection).toMatchObject({ from: 1, to: 6 })

    const preventDefault = vi.fn()
    preserveEditorSelectionOnPointerDown({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    editor.destroy()
  })
})
