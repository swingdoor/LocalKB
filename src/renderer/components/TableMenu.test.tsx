import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { CellSelection } from '@tiptap/pm/tables'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorInteractionCoordinator } from '../editor/interactionContext'
import TableMenu from './TableMenu'

describe('TableMenu interaction scope', () => {
  let editor: Editor
  let editorElement: HTMLDivElement
  let menuElement: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    editorElement = document.createElement('div')
    menuElement = document.createElement('div')
    document.body.append(editorElement, menuElement)
    root = createRoot(menuElement)
    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: {
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
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    editor.destroy()
    editorElement.remove()
    menuElement.remove()
    document.body.querySelectorAll('.table-context-menu').forEach((element) => element.remove())
  })

  it('establishes CellSelection before opening structural actions from a cell context menu', () => {
    const cellPositions: number[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cellPositions.push(pos)
    })
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: cellPositions[0] + 2, inside: cellPositions[0] })

    act(() => root.render(
      <TableMenu editor={editor} interaction={createEditorInteractionCoordinator()} />,
    ))

    const cell = editorElement.querySelector('td')!
    act(() => cell.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    })))

    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    expect(editor.state.selection.from).toBeGreaterThanOrEqual(cellPositions[0])
    expect(document.body.querySelector('.table-context-menu')).not.toBeNull()
    const trigger = document.body.querySelector<HTMLElement>('.table-menu-control')
    expect(trigger === null || trigger.style.display === 'none').toBe(true)
  })
})
