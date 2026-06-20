import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { describe, expect, it, vi } from 'vitest'
import { handleRichPaste, looksLikeMarkdown, markdownToHtml, sanitizePastedHtml } from './richPaste'

describe('rich paste Markdown detection', () => {
  it('detects block Markdown with headings and lists', () => {
    expect(looksLikeMarkdown('# Project Notes\n\n- Item A\n- Item B')).toBe(true)
  })

  it('does not convert ordinary text with Markdown-like punctuation', () => {
    expect(looksLikeMarkdown('#1 priority is follow up')).toBe(false)
    expect(looksLikeMarkdown('Use ** only if needed')).toBe(false)
  })

  it('detects Markdown tables', () => {
    expect(looksLikeMarkdown('| Name | Value |\n| --- | --- |\n| A | 1 |')).toBe(true)
  })
})

describe('rich paste Markdown conversion', () => {
  it('converts Markdown headings, lists, and bold marks to HTML', () => {
    const html = markdownToHtml('# Project Notes\n\n- Item A\n- Item B\n\n**Important:** keep this.')

    expect(html).toContain('<h1>Project Notes</h1>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>Important:</strong>')
  })

  it('converts Markdown tables to HTML tables', () => {
    const html = markdownToHtml('| Name | Value |\n| --- | --- |\n| A | 1 |')

    expect(html).toContain('<table>')
    expect(html).toContain('<th>Name</th>')
    expect(html).toContain('<td>1</td>')
  })
})

describe('rich paste HTML sanitization', () => {
  it('removes unsafe tags and event handlers', () => {
    const html = sanitizePastedHtml('<h1 onclick="alert(1)">Title</h1><script>alert(2)</script>')

    expect(html).toContain('<h1>Title</h1>')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('<script>')
  })

  it('normalizes checkbox lists into TipTap task list markup', () => {
    const html = sanitizePastedHtml('<ul><li>[x] Done</li><li>[ ] Later</li></ul>')

    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-type="taskItem"')
    expect(html).toContain('data-checked="true"')
  })
})

describe('rich paste TipTap insertion', () => {
  it('inserts likely Markdown as TipTap JSON nodes', () => {
    const editor = createTestEditor()
    const event = createPasteEvent('', '# Project Notes\n\n- Item A\n- Item B')

    expect(handleRichPaste(editor.view, event)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(editor.getJSON()).toMatchObject({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 } },
        { type: 'bulletList' },
      ],
    })

    editor.destroy()
  })

  it('preserves the first pasted HTML heading as a heading node', () => {
    const editor = createTestEditor()
    const event = createPasteEvent('<h1>Copied Title</h1><p>Body</p>', 'Copied Title\nBody')

    expect(handleRichPaste(editor.view, event)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 } },
        { type: 'paragraph' },
      ],
    })

    editor.destroy()
  })

  it('inserts sanitized HTML tables as TipTap table nodes', () => {
    const editor = createTestEditor()
    const html = '<table><tbody><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></tbody></table>'

    expect(handleRichPaste(editor.view, createPasteEvent(html, ''))).toBe(true)
    const json = editor.getJSON()

    expect(json.type).toBe('doc')
    expect(json.content?.some((node) => node.type === 'table')).toBe(true)

    editor.destroy()
  })
})

function createTestEditor() {
  return new Editor({
    extensions: [
      StarterKit,
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
  })
}

function createPasteEvent(html: string, text: string): ClipboardEvent {
  return {
    clipboardData: {
      getData: (type: string) => {
        if (type === 'text/html') return html
        if (type === 'text/plain') return text
        return ''
      },
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent
}
