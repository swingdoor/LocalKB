import { Editor, Node } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import {
  captureSelectedNode,
  deleteNodeTarget,
  updateNodeTargetAttrs,
} from './nodeCommands'

const Canvas = Node.create({
  name: 'canvasReference', group: 'block', atom: true, selectable: true,
  addAttributes: () => ({ nodeId: { default: null }, textAlign: { default: 'left' } }),
  renderHTML: () => ['div', { 'data-canvas-reference': '' }],
})

describe('typed node commands', () => {
  it('updates only an exact live node target and preserves its selection', () => {
    const editor = new Editor({
      extensions: [StarterKit, Canvas],
      content: { type: 'doc', content: [{ type: 'canvasReference', attrs: { nodeId: 'node-1' } }] },
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    const target = captureSelectedNode(editor, 'canvasReference')!
    expect(updateNodeTargetAttrs(editor, target, { textAlign: 'center' })).toBe(true)
    expect(editor.getJSON().content?.[0].attrs?.textAlign).toBe('center')
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)

    expect(updateNodeTargetAttrs(editor, { ...target, nodeId: 'stale' }, { textAlign: 'right' })).toBe(false)
    expect(editor.getJSON().content?.[0].attrs?.textAlign).toBe('center')
    expect(deleteNodeTarget(editor, target)).toBe(true)
    expect(editor.getJSON().content?.[0].type).toBe('paragraph')
    editor.destroy()
  })
})
