import { Editor, Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { isNodeRangeSelection } from '@tiptap/extension-node-range'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StableNodeId } from '../extensions/StableNodeId'
import { handleRootBlockDrop } from '../editor/rootBlockDrop'
import EditorBlockDragHandle from './EditorBlockDragHandle'

const BlockAtom = (name: string) => Node.create({
  name,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ resourceId: { default: null } }),
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, [`data-${name}`]: '' }],
})

const InlineAtom = (name: string) => Node.create({
  name,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  renderHTML: ({ HTMLAttributes }) => ['span', { ...HTMLAttributes, [`data-${name}`]: '' }],
})

class TestDataTransfer {
  private data = new Map<string, string>()
  effectAllowed = 'all'
  dropEffect = 'move'
  files: File[] = []
  items: unknown[] = []

  get types() { return [...this.data.keys()] }
  clearData() { this.data.clear() }
  setData(type: string, value: string) { this.data.set(type, value) }
  getData(type: string) { return this.data.get(type) ?? '' }
  setDragImage() {}
}

function dragEvent(type: string, dataTransfer: TestDataTransfer, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: 20 },
    clientY: { value: clientY },
    ctrlKey: { value: false },
    altKey: { value: false },
  })
  return event
}

const fixtures: Array<[string, Record<string, unknown>]> = [
  ['paragraph', { type: 'paragraph', content: [{ type: 'text', text: '段落' }] }],
  ['heading', { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '标题' }] }],
  ['blockquote', { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用' }] }] }],
  ['bulletList', { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '列表' }] }] }] }],
  ['orderedList', { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '编号' }] }] }] }],
  ['taskList', { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '待办' }] }] }] }],
  ['codeBlock', { type: 'codeBlock', content: [{ type: 'text', text: 'const value = 1' }] }],
  ['table', { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '单元格' }] }] }] }] }],
  ['horizontalRule', { type: 'horizontalRule' }],
  ['details', { type: 'details', content: [
    { type: 'detailsSummary', content: [{ type: 'text', text: '摘要' }] },
    { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '详情' }] }] },
  ] }],
  ['image', { type: 'image', attrs: { resourceId: 'image' } }],
  ['assetImage', { type: 'assetImage', attrs: { resourceId: 'asset-image' } }],
  ['fileAttachment', { type: 'fileAttachment', attrs: { resourceId: 'attachment' } }],
  ['canvasReference', { type: 'canvasReference', attrs: { resourceId: 'canvas' } }],
  ['mindmapReference', { type: 'mindmapReference', attrs: { resourceId: 'mindmap' } }],
]

function withStableNodeIds(value: Record<string, any>, prefix: string) {
  let index = 0
  const visit = (node: Record<string, any>): Record<string, any> => {
    const next = { ...node }
    if (node.type !== 'text') {
      index += 1
      next.attrs = { ...node.attrs, nodeId: `${prefix}-${index}` }
    }
    if (Array.isArray(node.content)) next.content = node.content.map(visit)
    return next
  }
  return visit(value)
}

describe('official root block drag flow', () => {
  const editors: Editor[] = []
  const roots: Array<ReturnType<typeof createRoot>> = []

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [],
    })
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  function mount(
    content: Record<string, unknown>,
    options: {
      hoverPos?: number
      onNodeChange?: (target: { node: any; pos: number } | null) => void
      trailingContent?: Record<string, unknown> | Record<string, unknown>[]
    } = {},
  ) {
    const host = document.createElement('div')
    const editorElement = document.createElement('div')
    const reactElement = document.createElement('div')
    host.append(editorElement, reactElement)
    document.body.appendChild(host)
    const editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        Table,
        TableRow,
        TableHeader,
        TableCell,
        Details.configure({ persist: false }),
        DetailsSummary,
        DetailsContent,
        BlockAtom('image'),
        BlockAtom('assetImage'),
        BlockAtom('fileAttachment'),
        BlockAtom('canvasReference'),
        BlockAtom('mindmapReference'),
        InlineAtom('documentReference'),
        StableNodeId,
      ],
      content: {
        type: 'doc',
        content: [
          withStableNodeIds(content, 'dragged'),
          ...(Array.isArray(options.trailingContent)
            ? options.trailingContent
            : [options.trailingContent
              ?? { type: 'paragraph', content: [{ type: 'text', text: '尾部' }] }]
          ).map((node, index) => withStableNodeIds(node, `tail-${index}`)),
        ],
      },
      editorProps: {
        handleDrop: handleRootBlockDrop,
      },
    })
    editors.push(editor)
    const root = createRoot(reactElement)
    roots.push(root)
    act(() => root.render(
      <EditorBlockDragHandle
        editor={editor}
        onNodeChange={options.onNodeChange}
      />,
    ))

    Object.defineProperty(editor.view.dom, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 600, width: 600, height: 600,
        toJSON: () => ({}),
      }),
    })
    Array.from(editor.view.dom.children).forEach((element, index) => {
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          x: 0,
          y: index * 100,
          top: index * 100,
          left: 0,
          right: 600,
          bottom: index * 100 + 100,
          width: 600,
          height: 100,
          toJSON: () => ({}),
        }),
      })
    })
    vi.spyOn(editor.view, 'posAtCoords').mockImplementation(({ top }) => {
      if (top < 100) return {
        pos: options.hoverPos ?? (editor.state.doc.child(0).isAtom ? 0 : 1),
        inside: 0,
      }
      return { pos: editor.state.doc.content.size, inside: -1 }
    })
    return { editor }
  }

  it.each(fixtures)('moves a complete %s root block and preserves its JSON and stable IDs', (_nodeType, content) => {
    const { editor } = mount(content)
    const original = editor.getJSON().content![0]

    act(() => editor.view.dom.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    })))
    const handle = document.querySelector<HTMLElement>('.editor-drag-handle')!
    const dataTransfer = new TestDataTransfer()
    act(() => handle.dispatchEvent(dragEvent('dragstart', dataTransfer, 20)))

    expect(isNodeRangeSelection(editor.state.selection)).toBe(true)

    act(() => editor.view.dom.dispatchEvent(dragEvent('drop', dataTransfer, 400)))
    expect(editor.getJSON().content?.[1]).toEqual(original)

    let undoResult = false
    act(() => { undoResult = editor.commands.undo() })
    expect(undoResult).toBe(true)
    expect(editor.getJSON().content?.[0]).toEqual(original)
    let redoResult = false
    act(() => { redoResult = editor.commands.redo() })
    expect(redoResult).toBe(true)
    expect(editor.getJSON().content?.[1]).toEqual(original)
  })

  it('cancels an invalid drop without mutating the document', () => {
    const { editor } = mount(fixtures[0][1])
    const original = editor.getJSON()
    act(() => editor.view.dom.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    })))
    const dataTransfer = new TestDataTransfer()
    const handle = document.querySelector<HTMLElement>('.editor-drag-handle')!
    act(() => handle.dispatchEvent(dragEvent('dragstart', dataTransfer, 20)))
    vi.mocked(editor.view.posAtCoords).mockReturnValue(null)
    act(() => editor.view.dom.dispatchEvent(dragEvent('drop', dataTransfer, 900)))
    expect(editor.getJSON()).toEqual(original)
  })

  it('rejects moving a root document-reference paragraph into a list item', () => {
    const { editor } = mount({
      type: 'paragraph',
      content: [{ type: 'documentReference' }],
    }, {
      trailingContent: [
        {
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '列表目标' }] }],
          }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '尾部' }] },
      ],
    })
    const original = editor.getJSON()

    act(() => editor.view.dom.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    })))
    const dataTransfer = new TestDataTransfer()
    const handle = document.querySelector<HTMLElement>('.editor-drag-handle')!
    act(() => handle.dispatchEvent(dragEvent('dragstart', dataTransfer, 20)))

    let nestedParagraphPosition = -1
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'paragraph' && node.textContent === '列表目标') {
        nestedParagraphPosition = position + 1
        return false
      }
      return undefined
    })
    expect(nestedParagraphPosition).toBeGreaterThan(0)
    vi.mocked(editor.view.posAtCoords).mockReturnValue({
      pos: nestedParagraphPosition,
      inside: nestedParagraphPosition - 1,
    })

    const drop = dragEvent('drop', dataTransfer, 250)
    expect(handleRootBlockDrop(
      editor.view,
      drop as DragEvent,
      editor.view.dragging!.slice,
      true,
    )).toBe(true)
    act(() => editor.view.dom.dispatchEvent(drop))
    expect(editor.getJSON()).toEqual(original)
  })

  it.each([
    ['nested paragraph in blockquote', fixtures[2][1], 2, 'blockquote'],
    ['listItem and its paragraph', fixtures[3][1], 3, 'bulletList'],
    ['tableRow and tableCell content', fixtures[7][1], 4, 'table'],
    ['detailsSummary', fixtures[9][1], 2, 'details'],
    ['detailsContent paragraph', fixtures[9][1], 6, 'details'],
    ['inline documentReference', {
      type: 'paragraph',
      content: [{ type: 'text', text: '前' }, { type: 'documentReference' }, { type: 'text', text: '后' }],
    }, 2, 'paragraph'],
  ])('targets the root container instead of %s', (_label, content, hoverPos, expectedType) => {
    const onNodeChange = vi.fn()
    const { editor } = mount(content as Record<string, unknown>, { hoverPos: Number(hoverPos), onNodeChange })

    act(() => editor.view.dom.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    })))

    const target = onNodeChange.mock.calls.slice().reverse().find((call) => call[0] !== null)?.[0]
    expect(target?.node.type.name).toBe(expectedType)
    expect(target?.pos).toBe(0)
  })
})
