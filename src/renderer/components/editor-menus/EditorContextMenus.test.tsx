import { Editor, Node } from '@tiptap/core'
import { NodeRangeSelection } from '@tiptap/extension-node-range'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorInteractionCoordinator } from '../../editor/interactionContext'
import EditorContextMenus from './EditorContextMenus'

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({ editor, shouldShow, pluginKey, children }: any) => {
    const element = document.createElement('div')
    const visible = shouldShow?.({
      editor,
      state: editor.state,
      oldState: editor.state,
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      view: editor.view,
      element,
    })
    return visible ? <div data-menu-plugin={String(pluginKey)}>{children}</div> : null
  },
}))

const Atom = (name: string, inline = false) => Node.create({
  name,
  group: inline ? 'inline' : 'block',
  inline,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    nodeId: { default: null },
    canvasId: { default: null },
    mindmapId: { default: null },
    assetId: { default: null },
    documentId: { default: null },
    fileName: { default: null },
    label: { default: null },
    textAlign: { default: 'left' },
  }),
  renderHTML: () => inline ? ['span', { [`data-${name}`]: '' }] : ['div', { [`data-${name}`]: '' }],
})

describe('typed editor contextual menus', () => {
  let editor: Editor
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const interaction = createEditorInteractionCoordinator()

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    interaction.reset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    editor = new Editor({
      extensions: [
        StarterKit,
        Atom('image'),
        Atom('assetImage'),
        Atom('fileAttachment'),
        Atom('canvasReference'),
        Atom('mindmapReference'),
        Atom('documentReference', true),
      ],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '选中文本' }] },
          { type: 'image', attrs: { nodeId: 'image' } },
          { type: 'assetImage', attrs: { nodeId: 'asset', assetId: 'asset' } },
          { type: 'fileAttachment', attrs: { nodeId: 'attachment', assetId: 'file', fileName: '文件' } },
          { type: 'canvasReference', attrs: { nodeId: 'canvas', canvasId: 'canvas' } },
          { type: 'mindmapReference', attrs: { nodeId: 'mindmap', mindmapId: 'mindmap' } },
          { type: 'paragraph', content: [
            { type: 'text', text: '前' },
            { type: 'documentReference', attrs: { nodeId: 'reference', documentId: 'doc', label: '引用' } },
            { type: 'text', text: '后' },
          ] },
        ],
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    editor.destroy()
    container.remove()
  })

  function nodePos(nodeType: string) {
    let found = -1
    editor.state.doc.descendants((node, pos) => {
      if (found < 0 && node.type.name === nodeType) found = pos
    })
    return found
  }

  function renderMenus(revision: number) {
    act(() => root.render(
      <div data-revision={revision}>
        <EditorContextMenus
          editor={editor}
          interaction={interaction}
          vaultId="vault"
          documentId="document"
          onEditCanvas={() => undefined}
          onEditMindMap={() => undefined}
          onOpenDocument={() => undefined}
          onSelectDocument={async () => null}
          onPolish={() => undefined}
          onExpand={() => undefined}
        />
      </div>,
    ))
    return Array.from(container.querySelectorAll<HTMLElement>('[data-menu-plugin]'))
      .map((element) => element.dataset.menuPlugin)
  }

  it('shows exactly one primary menu for each supported Selection domain', () => {
    act(() => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4))))
    expect(renderMenus(1)).toEqual(['textSelectionMenu'])

    const cases = [
      ['image', 'imageNodeMenu'],
      ['assetImage', 'assetImageNodeMenu'],
      ['fileAttachment', 'attachmentNodeMenu'],
      ['canvasReference', 'canvasNodeMenu'],
      ['mindmapReference', 'mindmapNodeMenu'],
      ['documentReference', 'documentReferenceMenu'],
    ] as const
    cases.forEach(([nodeType, pluginKey], index) => {
      act(() => editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos(nodeType))),
      ))
      expect(renderMenus(index + 2)).toEqual([pluginKey])
    })
  })

  it('suppresses every typed menu for NodeRangeSelection and exclusive gestures', () => {
    const imagePos = nodePos('image')
    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeRangeSelection.create(editor.state.doc, imagePos, imagePos + 1)),
    ))
    expect(renderMenus(20)).toEqual([])

    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imagePos)),
    ))
    act(() => interaction.beginGesture('nodeResizing', 'image'))
    expect(renderMenus(21)).toEqual([])
    act(() => interaction.endGesture('nodeResizing'))

  })

  it('uses stable, unique plugin keys for all typed menu instances', () => {
    const pluginKeys = [
      'textSelectionMenu',
      'imageNodeMenu',
      'assetImageNodeMenu',
      'attachmentNodeMenu',
      'documentReferenceMenu',
      'canvasNodeMenu',
      'mindmapNodeMenu',
    ]
    expect(new Set(pluginKeys).size).toBe(pluginKeys.length)
  })

  it('clears type-local input state when Selection leaves that node domain', () => {
    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos('image'))),
    ))
    renderMenus(30)
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="编辑替代文字"]')!.click())
    expect(container.querySelector('[aria-label="图片替代文字"]')).not.toBeNull()

    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos('fileAttachment'))),
    ))
    renderMenus(31)
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="修改显示名"]')!.click())
    expect(container.querySelector('[aria-label="附件显示名"]')).not.toBeNull()

    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos('image'))),
    ))
    renderMenus(32)
    expect(container.querySelector('[aria-label="图片替代文字"]')).toBeNull()
    expect(container.querySelector('[aria-label="附件显示名"]')).toBeNull()
  })

  it('closes only the node toolbar on Escape and preserves its NodeSelection', () => {
    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos('canvasReference'))),
    ))
    renderMenus(40)
    const toolbar = container.querySelector<HTMLElement>('[aria-label="画布操作"]')!
    act(() => toolbar.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    })))

    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(toolbar.style.display).toBe('none')
  })

  it('keeps root duplicate/delete commands out of root node type menus', () => {
    const rootNodeTypes = ['image', 'assetImage', 'fileAttachment', 'canvasReference', 'mindmapReference']
    rootNodeTypes.forEach((nodeType, index) => {
      act(() => editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos(nodeType))),
      ))
      renderMenus(50 + index)
      expect(container.querySelector('[aria-label^="删除"]')).toBeNull()
    })

    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos('documentReference'))),
    ))
    renderMenus(60)
    expect(container.querySelector('[aria-label="删除文档引用"]')).not.toBeNull()
  })

  it('dismisses only the current menu outside without consuming the new pointer target', () => {
    act(() => editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, nodePos('canvasReference'))),
    ))
    renderMenus(70)
    const toolbar = container.querySelector<HTMLElement>('[aria-label="画布操作"]')!
    expect(toolbar.style.display).not.toBe('none')

    const outside = document.createElement('button')
    const nextScopeHandler = vi.fn()
    outside.addEventListener('pointerdown', nextScopeHandler)
    document.body.appendChild(outside)
    act(() => outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))

    expect(nextScopeHandler).toHaveBeenCalledOnce()
    expect(toolbar.style.display).toBe('none')
    outside.remove()
  })
})
