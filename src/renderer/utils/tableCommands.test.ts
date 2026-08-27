import { Editor } from '@tiptap/core'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import StarterKit from '@tiptap/starter-kit'
import { expect, it } from 'vitest'

it('supports the table operations exposed by the toolbar', () => {
  const editor = new Editor({
    extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
  })

  expect(editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })).toBe(true)
  expect(editor.commands.addRowAfter()).toBe(true)
  expect(editor.commands.addColumnAfter()).toBe(true)
  expect(editor.commands.toggleHeaderColumn()).toBe(true)

  const cellPositions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cellPositions.push(pos)
  })

  expect(editor.commands.setCellSelection({ anchorCell: cellPositions[4], headCell: cellPositions[5] })).toBe(true)
  expect(editor.commands.mergeCells()).toBe(true)
  expect(editor.commands.splitCell()).toBe(true)
  expect(editor.commands.toggleHeaderRow()).toBe(true)
  expect(editor.commands.deleteRow()).toBe(true)
  expect(editor.commands.deleteColumn()).toBe(true)
  expect(editor.commands.deleteTable()).toBe(true)
  expect(editor.getJSON().content?.some(node => node.type === 'table')).toBe(false)

  editor.destroy()
})
