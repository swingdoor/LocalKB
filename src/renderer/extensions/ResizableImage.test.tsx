import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEditorInteractionCoordinator } from '../editor/interactionContext'
import { ResizableImage } from './ResizableImage'

describe('resizable image interaction', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let mountedEditor: Editor | null

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mountedEditor = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('uses a draft size during drag and commits one undoable width change on pointer release', async () => {
    const interaction = createEditorInteractionCoordinator()
    function ImageEditor() {
      const editor = useEditor({
        extensions: [StarterKit, ResizableImage.configure({ interaction })],
        content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'data:image/png;base64,AA==' } }] },
        onCreate: ({ editor: createdEditor }) => {
          createdEditor.commands.setNodeSelection(0)
          mountedEditor = createdEditor
        },
      })
      return <EditorContent editor={editor} />
    }

    await act(async () => {
      root.render(<ImageEditor />)
      await Promise.resolve()
      await Promise.resolve()
    })
    const image = container.querySelector<HTMLImageElement>('.resizable-image-wrapper img')!
    Object.defineProperty(image, 'offsetWidth', { configurable: true, value: 300 })
    const handle = container.querySelector<HTMLElement>('.resize-handle-e')!

    await act(async () => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }))
      await Promise.resolve()
    })
    expect(interaction.getSnapshot().kind).toBe('nodeResizing')

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 350 }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 350 }))
      await Promise.resolve()
    })
    expect(interaction.getSnapshot().kind).toBe('idle')
    expect(mountedEditor?.getJSON().content?.[0].attrs?.width).toBe(350)

    await act(async () => {
      mountedEditor?.commands.undo()
      await Promise.resolve()
    })
    expect(mountedEditor?.getJSON().content?.[0].attrs?.width).toBeNull()
  })
})
