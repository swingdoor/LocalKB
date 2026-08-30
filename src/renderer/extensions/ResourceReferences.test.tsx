import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectDocumentReferences } from '@shared/knowledge-operations'
import type { TipTapDocument } from '@shared/knowledge-types'
import {
  AssetImage, calculatePreviewFit, CanvasReference, CanvasReferenceView, clampPreviewZoom,
  MindMapReference, MindMapReferenceView, stopInteractiveResourceEvent,
} from './ResourceReferences'
import { StableNodeId } from './StableNodeId'
import { createEditorInteractionCoordinator } from '../editor/interactionContext'

const mindMock = vi.hoisted(() => ({ instances: [] as any[] }))

async function flushResourceLoad() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

vi.mock('@excalidraw/excalidraw', () => ({
  exportToSvg: vi.fn(async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 1200 800')
    Object.defineProperty(svg, 'viewBox', {
      configurable: true,
      value: { baseVal: { width: 1200, height: 800 } },
    })
    return svg
  }),
}))
vi.mock('mind-elixir', () => ({
  default: class {
    scaleVal = 1
    options: any
    constructor(options: any) {
      this.options = options
      options.el.appendChild(document.createElement('div'))
      mindMock.instances.push(this)
    }
    init() {}
    changeTheme() {}
    scaleFit() { this.scaleVal = 0.75 }
    scale(value: number) { this.scaleVal = value }
    destroy() {}
  },
}))

describe('native resource reference nodes', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mindMock.instances.length = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('persist only IDs and presentation attributes without preview payloads', () => {
    const canvasId = '11111111-1111-4111-8111-111111111111'
    const mindmapId = '22222222-2222-4222-8222-222222222222'
    const assetId = '33333333-3333-4333-8333-333333333333'
    const nodeIds = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]
    const editor = new Editor({
      extensions: [StarterKit, CanvasReference, MindMapReference, AssetImage, StableNodeId],
      content: {
        type: 'doc',
        content: [
          {
            type: 'canvasReference',
            attrs: { canvasId, nodeId: nodeIds[0], width: 480, height: 360, textAlign: 'center' },
          },
          {
            type: 'mindmapReference',
            attrs: { mindmapId, nodeId: nodeIds[1], width: null, textAlign: 'left' },
          },
          {
            type: 'assetImage',
            attrs: { assetId, nodeId: nodeIds[2], alt: '示意图', width: 320, textAlign: 'right' },
          },
        ],
      },
    })

    const document = editor.getJSON() as TipTapDocument
    const serialized = JSON.stringify(document)
    const html = editor.getHTML()
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain('svg')
    expect(serialized).not.toContain('excalidrawData')
    expect(html).toContain(`data-canvas-id="${canvasId}"`)
    expect(html).toContain(`data-mindmap-id="${mindmapId}"`)
    expect(html).toContain(`data-asset-id="${assetId}"`)
    expect(html).toContain('data-width="480"')
    expect(html).toContain('data-height="360"')
    expect(html).toContain('data-text-align="center"')
    expect(document.content?.[0].attrs).toEqual({
      canvasId, nodeId: nodeIds[0], width: 480, height: 360, textAlign: 'center',
    })
    expect(document.content?.[1].attrs).toEqual({
      mindmapId, nodeId: nodeIds[1], width: null, textAlign: 'left', height: null,
    })
    expect(collectDocumentReferences(document)).toEqual([
      { type: 'canvas', id: canvasId, nodeId: nodeIds[0] },
      { type: 'mindmap', id: mindmapId, nodeId: nodeIds[1] },
      { type: 'asset', id: assetId, nodeId: nodeIds[2] },
    ])
    expect(editor.schema.nodes.canvasReference.spec.draggable).toBe(false)
    expect(editor.schema.nodes.mindmapReference.spec.draggable).toBe(false)

    const roundTripEditor = new Editor({
      extensions: [StarterKit, CanvasReference, MindMapReference, AssetImage, StableNodeId],
      content: html,
    })
    expect(roundTripEditor.getJSON()).toEqual(document)
    roundTripEditor.destroy()
    editor.destroy()
  })

  it('preserves resource node identities and attributes when top-level blocks are reordered', () => {
    const editor = new Editor({
      extensions: [StarterKit, CanvasReference, MindMapReference, StableNodeId],
      content: {
        type: 'doc',
        content: [
          {
            type: 'canvasReference',
            attrs: {
              canvasId: '11111111-1111-4111-8111-111111111111',
              nodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              width: 480,
              height: 360,
              textAlign: 'right',
            },
          },
          {
            type: 'mindmapReference',
            attrs: {
              mindmapId: '22222222-2222-4222-8222-222222222222',
              nodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              width: 640,
              height: 420,
              textAlign: 'center',
            },
          },
        ],
      },
    })
    const original = editor.getJSON() as TipTapDocument
    const firstNode = editor.state.doc.child(0)
    const secondNode = editor.state.doc.child(1)
    const secondPosition = firstNode.nodeSize

    editor.view.dispatch(
      editor.state.tr
        .delete(secondPosition, secondPosition + secondNode.nodeSize)
        .insert(0, secondNode),
    )

    const reordered = editor.getJSON() as TipTapDocument
    expect(reordered.content?.slice(0, 2).map((node) => node.type)).toEqual([
      'mindmapReference',
      'canvasReference',
    ])
    expect(reordered.content?.[0].attrs).toEqual(original.content?.[1].attrs)
    expect(reordered.content?.[1].attrs).toEqual(original.content?.[0].attrs)
    editor.destroy()
  })

  it('lets passive hover reach the editor drag handle while isolating resource gestures', () => {
    const viewport = document.createElement('div')
    const content = document.createElement('div')
    viewport.dataset.resourceViewport = ''
    viewport.appendChild(content)

    const hover = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(hover, 'target', { configurable: true, value: content })
    expect(stopInteractiveResourceEvent({ event: hover })).toBe(false)

    for (const eventType of ['mousedown', 'click', 'wheel']) {
      const gesture = new MouseEvent(eventType, { bubbles: true })
      Object.defineProperty(gesture, 'target', { configurable: true, value: content })
      expect(stopInteractiveResourceEvent({ event: gesture })).toBe(true)
    }
  })

  it('mounts resource references through TipTap React node views', async () => {
    window.electronAPI = { knowledge: {
      getCanvas: vi.fn(async () => ({ ok: true, data: {
        type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
      } })),
      getMindMap: vi.fn(async () => ({ ok: true, data: {
        nodeData: { id: 'root', topic: '中心主题', children: [] },
      } })),
      onChanged: vi.fn(() => () => undefined),
    } } as any
    function ResourceEditor() {
      const editor = useEditor({
        extensions: [
          StarterKit,
          CanvasReference.configure({ vaultId: 'vault-id', documentId: 'document-id' }),
          MindMapReference.configure({ vaultId: 'vault-id', documentId: 'document-id' }),
        ],
        content: {
          type: 'doc',
          content: [
            { type: 'canvasReference', attrs: { canvasId: 'canvas-id', height: 320 } },
            { type: 'mindmapReference', attrs: { mindmapId: 'mindmap-id', height: 320 } },
          ],
        },
      })
      return <EditorContent editor={editor} />
    }

    await act(async () => {
      root.render(<ResourceEditor />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelectorAll('[data-resource-frame]')).toHaveLength(2)
  })

  it('clamps resource preview zoom to safe bounds', () => {
    expect(clampPreviewZoom(0)).toBe(0.25)
    expect(clampPreviewZoom(2)).toBe(2)
    expect(clampPreviewZoom(8)).toBe(4)
  })

  it('fits and centers resource content inside its viewport', () => {
    expect(calculatePreviewFit(640, 320, 1200, 800)).toEqual({
      scale: 0.36,
      x: 104,
      y: 16,
    })
  })

  it('provides accessible canvas preview zoom and fit controls', async () => {
    window.electronAPI = { knowledge: {
      getCanvas: vi.fn(async () => ({ ok: true, data: {
        type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
      } })),
      onChanged: vi.fn(() => () => undefined),
    } } as any

    await act(async () => {
      root.render(<CanvasReferenceView
        node={{ attrs: { canvasId: 'canvas-id', width: null, height: null, textAlign: 'left' } }}
        updateAttributes={vi.fn()}
        selected
        extension={{ options: { vaultId: 'vault-id', documentId: 'document-id', onEdit: vi.fn() } }}
      />)
      await Promise.resolve()
      await Promise.resolve()
    })
    await flushResourceLoad()

    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="调整预览宽度"]')).not.toBeNull()
    const image = container.querySelector<HTMLImageElement>('img[alt="画布预览"]')!
    expect(image.className).toContain('h-full')
    expect(container.querySelector('[aria-label="适应窗口"]')).not.toBeNull()
  })

  it('renders edge-scoped resize handles without a full-window interaction layer', async () => {
    window.electronAPI = { knowledge: {
      getCanvas: vi.fn(async () => ({ ok: true, data: {
        type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
      } })),
      onChanged: vi.fn(() => () => undefined),
    } } as any

    await act(async () => {
      root.render(<CanvasReferenceView
        node={{ attrs: { canvasId: 'canvas-id', width: 500, height: 300, textAlign: 'left' } }}
        updateAttributes={vi.fn()}
        selected
        extension={{ options: { vaultId: 'vault-id', documentId: 'document-id', onEdit: vi.fn() } }}
      />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[aria-label="调整预览宽度"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="调整预览高度"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="调整预览大小"]')).not.toBeNull()
    expect(container.querySelector('[style*="position: fixed"]')).toBeNull()
  })

  it('ends the exclusive resize phase before committing the final resource size', async () => {
    const interaction = createEditorInteractionCoordinator()
    const phases: string[] = []
    interaction.subscribe(() => phases.push(interaction.getSnapshot().kind))
    const updateAttributes = vi.fn(() => {
      expect(interaction.getSnapshot().kind).toBe('idle')
    })
    window.electronAPI = { knowledge: {
      getCanvas: vi.fn(async () => ({ ok: true, data: {
        type: 'excalidraw', version: 2, source: 'test', elements: [], appState: {}, files: {},
      } })),
      onChanged: vi.fn(() => () => undefined),
    } } as any

    await act(async () => {
      root.render(<CanvasReferenceView
        node={{ attrs: { canvasId: 'canvas-id', width: 500, height: 300, textAlign: 'left' } }}
        updateAttributes={updateAttributes}
        selected
        extension={{ options: {
          vaultId: 'vault-id', documentId: 'document-id', onEdit: vi.fn(), interaction,
        } }}
      />)
      await Promise.resolve()
    })

    const frame = container.querySelector<HTMLElement>('[data-resource-selection-frame]')!
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 500, bottom: 300, width: 500, height: 300,
      toJSON: () => ({}),
    })
    const handle = container.querySelector<HTMLElement>('[data-resource-resize-handle="se"]')!
    await act(async () => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 300 }))
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 540, clientY: 340 }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 540, clientY: 340 }))
      await Promise.resolve()
    })

    expect(phases).toEqual(['nodeResizing', 'idle'])
    expect(updateAttributes).toHaveBeenCalledTimes(1)
    expect(updateAttributes).toHaveBeenCalledWith({ width: 540, height: 340 })
  })

  it('fits mind maps and exposes native zoom controls and edit navigation', async () => {
    const onEdit = vi.fn()
    window.electronAPI = { knowledge: {
      getMindMap: vi.fn(async () => ({ ok: true, data: {
        nodeData: { id: 'root', topic: '中心主题', children: [] },
      } })),
      onChanged: vi.fn(() => () => undefined),
    } } as any

    await act(async () => {
      root.render(<MindMapReferenceView
        node={{ attrs: { mindmapId: 'mindmap-id', width: null, height: null, textAlign: 'left' } }}
        updateAttributes={vi.fn()}
        selected
        extension={{ options: { vaultId: 'vault-id', documentId: 'document-id', onEdit } }}
      />)
      await Promise.resolve()
      await Promise.resolve()
    })
    await flushResourceLoad()

    expect(container.querySelector('[aria-label="当前缩放 75%"]')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('[data-resource-viewport]')?.dataset.resourceInteractive).toBe('true')
    expect(container.querySelector('[aria-label="调整预览高度"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="调整预览大小"]')).not.toBeNull()
    const regularWheel = new WheelEvent('wheel', { cancelable: true, deltaY: 10 })
    act(() => mindMock.instances[0].options.handleWheel(regularWheel))
    expect(regularWheel.defaultPrevented).toBe(false)
    const zoomWheel = new WheelEvent('wheel', { cancelable: true, ctrlKey: true, deltaY: -10 })
    act(() => mindMock.instances[0].options.handleWheel(zoomWheel))
    expect(zoomWheel.defaultPrevented).toBe(true)
    expect(mindMock.instances[0].scaleVal).toBeCloseTo(0.95)
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="放大预览"]')!.click())
    expect(container.querySelector('[aria-label="当前缩放 115%"]')).not.toBeNull()
    expect(mindMock.instances[0].scaleVal).toBeCloseTo(1.15)
    act(() => container.querySelector('[data-resource-frame]')!.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
    })))
    expect(onEdit).toHaveBeenCalledWith('mindmap-id')
  })
})
