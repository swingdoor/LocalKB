import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasReference } from './ResourceReferences'
import EditorBubbleMenu from '../components/BubbleMenu'

vi.mock('@tiptap/react', async () => {
  const actual = await vi.importActual<typeof import('@tiptap/react')>('@tiptap/react')
  return {
    ...actual,
    BubbleMenu: ({ children }: { children: React.ReactNode }) => children,
  }
})

vi.mock('@excalidraw/excalidraw', () => ({
  exportToSvg: vi.fn(async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 1200 800')
    return svg
  }),
}))

let mountedEditor: Editor | null = null

function ResourceEditor({ withMenu = false }: { withMenu?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      CanvasReference.configure({ vaultId: 'vault-id', documentId: 'document-id' }),
    ],
    content: {
      type: 'doc',
      content: [{
        type: 'canvasReference',
        attrs: { canvasId: 'canvas-id', width: 320, height: 320, textAlign: 'left' },
      }],
    },
    onCreate: ({ editor: createdEditor }) => {
      createdEditor.commands.setNodeSelection(0)
      mountedEditor = createdEditor
    },
  })
  return (
    <>
      {editor && withMenu && (
        <EditorBubbleMenu editor={editor} vaultId="vault-id" documentId="document-id" />
      )}
      <EditorContent editor={editor} />
    </>
  )
}

describe('resource references in a mounted TipTap editor', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mountedEditor = null
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    window.electronAPI = { knowledge: {
      getCanvas: vi.fn(async () => ({ ok: true, data: {
        type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
      } })),
      onChanged: vi.fn(() => () => undefined),
    } } as any
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('initializes the real preview viewport without crashing the editor', async () => {
    await act(async () => {
      root.render(<ResourceEditor />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-resource-frame]')).not.toBeNull()
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
  })

  it('keeps the preview viewport mounted while the TipTap node view is detached', async () => {
    container.remove()
    await act(async () => {
      root.render(<ResourceEditor />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-resource-frame]')).not.toBeNull()
    await act(async () => {
      document.body.appendChild(container)
      await Promise.resolve()
    })
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
  })

  it('handles a normal mouse click when aligning the entire preview container', async () => {
    await act(async () => {
      root.render(<ResourceEditor withMenu />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mountedEditor).not.toBeNull()
    await act(async () => {
      mountedEditor!.commands.setNodeSelection(0)
      mountedEditor!.view.focus()
      await Promise.resolve()
    })

    const centerButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.title === '居中')
    expect(centerButton).toBeDefined()

    await act(async () => {
      centerButton!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      }))
      await Promise.resolve()
    })

    expect(mountedEditor!.getJSON().content?.[0].attrs?.textAlign).toBe('center')
    const alignmentRow = container.querySelector<HTMLElement>('[data-resource-alignment-row]')
    expect(alignmentRow?.dataset.textAlign).toBe('center')
    expect(alignmentRow?.style.justifyItems).toBe('center')
    expect(container.querySelector('[data-resource-preview-container]')).not.toBeNull()
  })
})
