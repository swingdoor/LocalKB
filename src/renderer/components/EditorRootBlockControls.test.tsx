import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditorInteractionCoordinator } from '../editor/interactionContext'
import EditorRootBlockControls from './EditorRootBlockControls'

describe('EditorRootBlockControls event ownership', () => {
  let editor: Editor
  let root: ReturnType<typeof createRoot>
  let editorElement: HTMLDivElement
  let controlsElement: HTMLDivElement

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

    editorElement = document.createElement('div')
    controlsElement = document.createElement('div')
    document.body.append(editorElement, controlsElement)
    editor = new Editor({
      element: editorElement,
      extensions: [StarterKit],
      content: '<p>第一段</p><p>第二段</p>',
    })
    root = createRoot(controlsElement)
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
          x: 0, y: index * 100, top: index * 100, left: 0, right: 600,
          bottom: index * 100 + 100, width: 600, height: 100,
          toJSON: () => ({}),
        }),
      })
    })
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 1, inside: 0 })

    act(() => root.render(
      <EditorRootBlockControls
        editor={editor}
        interaction={createEditorInteractionCoordinator()}
      />,
    ))
    act(() => editor.view.dom.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    })))
  })

  afterEach(() => {
    act(() => root.unmount())
    editor.destroy()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('uses left click for no menu and right click for only the hovered root block menu', () => {
    const grip = document.querySelector<HTMLElement>('.editor-drag-handle span')!
    const selectionBefore = editor.state.selection

    act(() => grip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(document.body.querySelector('.editor-block-actions-menu')).toBeNull()

    act(() => grip.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 30,
    })))
    expect(document.body.querySelector('.editor-block-actions-menu')).not.toBeNull()
    expect(document.body.querySelector('.editor-block-menu-trigger')).toBeNull()
    expect(editor.state.selection.eq(selectionBefore)).toBe(true)
  })

  it('closes itself on outside pointerdown without consuming the outside action', () => {
    const grip = document.querySelector<HTMLElement>('.editor-drag-handle span')!
    act(() => grip.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 30,
    })))

    const outside = document.createElement('button')
    const outsideHandler = vi.fn()
    outside.addEventListener('pointerdown', outsideHandler)
    document.body.appendChild(outside)
    act(() => outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })))

    expect(outsideHandler).toHaveBeenCalledOnce()
    expect(document.body.querySelector('.editor-block-actions-menu')).toBeNull()
  })
})
