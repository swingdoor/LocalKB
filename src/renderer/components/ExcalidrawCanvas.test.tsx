import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoadedCanvas } from '@shared/knowledge-types'
import { useAppStore } from '../stores/appStore'

const mockCanvas = vi.hoisted(() => ({
  shouldThrow: false,
  props: null as any,
}))

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: (props: any) => {
    mockCanvas.props = props
    if (mockCanvas.shouldThrow) throw new Error('模拟渲染错误')
    return React.createElement('div', { 'data-testid': 'excalidraw' }, 'Excalidraw')
  },
  serializeAsJSON: (elements: unknown, appState: unknown, files: unknown) => JSON.stringify({
    type: 'excalidraw', version: 2, source: 'test', elements, appState, files,
  }),
  exportToBlob: vi.fn(),
}))

import ExcalidrawCanvas from './ExcalidrawCanvas'

const scene = {
  type: 'excalidraw' as const,
  version: 2,
  source: 'test',
  elements: [],
  appState: {},
  files: {},
}
const canvas: LoadedCanvas = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  contentType: 'canvas',
  title: '新建画布',
  parentId: null,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  content: scene,
}

describe('ExcalidrawCanvas', () => {
  let container: HTMLDivElement
  let root: Root
  const onUpdate = vi.fn(async () => canvas)
  const renameContent = vi.fn(async () => true)

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockCanvas.shouldThrow = false
    mockCanvas.props = null
    onUpdate.mockClear()
    renameContent.mockClear()
    useAppStore.setState({ renameContent })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function renderCanvas(value = canvas) {
    await act(async () => {
      root.render(<ExcalidrawCanvas canvas={value} onUpdate={onUpdate} />)
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('loads an empty native scene and keeps initial data stable after save feedback', async () => {
    await renderCanvas()
    expect(container.querySelector('[data-testid="excalidraw"]')).not.toBeNull()
    const initialData = mockCanvas.props.initialData

    await act(async () => {
      mockCanvas.props.onChange([], { viewBackgroundColor: '#fff' }, {})
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })
    expect(onUpdate).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(<ExcalidrawCanvas
        canvas={{ ...canvas, updatedAt: '2026-01-01T00:00:01.000Z', content: { ...scene } }}
        onUpdate={onUpdate}
      />)
    })
    expect(mockCanvas.props.initialData).toBe(initialData)
  })

  it('shows the renderer error and retries without reloading the application', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockCanvas.shouldThrow = true
    await renderCanvas()

    expect(container.textContent).toContain('画布加载失败')
    expect(container.textContent).toContain('模拟渲染错误')
    mockCanvas.shouldThrow = false
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('重试加载'))!
        .click()
      await Promise.resolve()
    })
    expect(container.querySelector('[data-testid="excalidraw"]')).not.toBeNull()
    errorLog.mockRestore()
  })

  it('saves the title and keeps view-mode actions scoped to the Excalidraw API', async () => {
    await renderCanvas()
    const title = container.querySelector<HTMLInputElement>('input[aria-label="画布标题"]')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(title, '系统架构图')
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
    })
    expect(renameContent).toHaveBeenCalledWith(canvas.id, '系统架构图')

    const updateScene = vi.fn()
    act(() => mockCanvas.props.excalidrawAPI({ updateScene }))
    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('查看'))!
      .click())
    expect(updateScene).toHaveBeenCalledWith(expect.objectContaining({
      appState: expect.objectContaining({ viewModeEnabled: true }),
    }))
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('导出'))).toBe(true)
  })
})
