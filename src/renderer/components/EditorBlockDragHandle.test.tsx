import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditorBlockDragHandle from './EditorBlockDragHandle'

describe('EditorBlockDragHandle', () => {
  let editor: Editor | null = null
  let reactRoot: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    if (reactRoot) act(() => reactRoot?.unmount())
    editor?.destroy()
    document.body.innerHTML = ''
    reactRoot = null
    editor = null
  })

  it('registers the official editor-level drag handle plugin', () => {
    const editorElement = document.createElement('div')
    const reactElement = document.createElement('div')
    document.body.append(editorElement, reactElement)
    editor = new Editor({
      element: editorElement,
      extensions: [StarterKit],
      content: '<p>第一段</p><p>第二段</p>',
    })
    reactRoot = createRoot(reactElement)

    act(() => reactRoot?.render(
      <EditorBlockDragHandle editor={editor!} />,
    ))

    expect(document.querySelector('.editor-drag-handle')).not.toBeNull()
    expect(editor.state.plugins.some((plugin) => (
      (plugin as unknown as { key?: string }).key?.startsWith('dragHandle')
    ))).toBe(true)
  })

  it('mounts beside React EditorContent without a plugin registration loop', () => {
    const reactElement = document.createElement('div')
    document.body.appendChild(reactElement)
    reactRoot = createRoot(reactElement)

    function ReactEditor() {
      const mountedEditor = useEditor({
        extensions: [StarterKit],
        content: '<p>第一段</p><p>第二段</p>',
        shouldRerenderOnTransaction: true,
      })
      editor = mountedEditor
      if (!mountedEditor) return null
      return (
        <>
          <EditorBlockDragHandle editor={mountedEditor} />
          <EditorContent editor={mountedEditor} />
        </>
      )
    }

    act(() => reactRoot?.render(<ReactEditor />))

    expect(document.querySelector('.ProseMirror')?.textContent).toContain('第一段')
    expect(document.querySelectorAll('.editor-drag-handle')).toHaveLength(1)
    expect(editor?.state.plugins.filter((plugin) => (
      (plugin as unknown as { key?: string }).key?.startsWith('dragHandle')
    ))).toHaveLength(1)
  })

  it('routes a completed left click to root block actions without changing selection', () => {
    const editorElement = document.createElement('div')
    const reactElement = document.createElement('div')
    document.body.append(editorElement, reactElement)
    editor = new Editor({
      element: editorElement,
      extensions: [StarterKit],
      content: '<p>第一段</p><p>第二段</p>',
    })
    reactRoot = createRoot(reactElement)
    const onMenuRequest = vi.fn((event: React.MouseEvent<HTMLSpanElement>) => event.preventDefault())
    act(() => reactRoot?.render(
      <EditorBlockDragHandle editor={editor!} onMenuRequest={onMenuRequest} />,
    ))

    const selectionBefore = editor.state.selection
    act(() => document.querySelector('.editor-drag-handle span')?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })))

    expect(onMenuRequest).toHaveBeenCalledOnce()
    expect(editor.state.selection.eq(selectionBefore)).toBe(true)
  })

  it('routes right click to the same root block actions without changing selection', () => {
    const editorElement = document.createElement('div')
    const reactElement = document.createElement('div')
    document.body.append(editorElement, reactElement)
    editor = new Editor({
      element: editorElement,
      extensions: [StarterKit],
      content: '<p>第一段</p><p>第二段</p>',
    })
    reactRoot = createRoot(reactElement)
    const onMenuRequest = vi.fn((event: React.MouseEvent<HTMLSpanElement>) => event.preventDefault())
    act(() => reactRoot?.render(
      <EditorBlockDragHandle editor={editor!} onMenuRequest={onMenuRequest} />,
    ))

    const selectionBefore = editor.state.selection
    const grip = document.querySelector('.editor-drag-handle span')!
    act(() => grip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))

    expect(onMenuRequest).toHaveBeenCalledOnce()
    expect(editor.state.selection.eq(selectionBefore)).toBe(true)
  })
})
