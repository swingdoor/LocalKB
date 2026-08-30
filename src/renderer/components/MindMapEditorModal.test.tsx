import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArrowSvg, SummarySvg, Topic } from 'mind-elixir'
import type { MindMapData } from '@shared/knowledge-types'
import MindMapEditorModal from './MindMapEditorModal'

const DATA: MindMapData = {
  nodeData: {
    id: 'root', topic: '中心主题',
    children: [{ id: 'a', topic: '节点 A', note: '节点 A 备注' }, { id: 'b', topic: '节点 B' }],
  },
  arrows: [{ id: 'arrow-a', label: '关联', from: 'a', to: 'b', delta1: { x: 80, y: 0 }, delta2: { x: -80, y: 0 } }],
  summaries: [{ id: 'summary-a', label: '概要', parent: 'root', start: 0, end: 1 }],
}

function pointer(type: string, options: { button?: number; x?: number; y?: number; id?: number } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true, cancelable: true, button: options.button ?? 0,
    clientX: options.x ?? 100, clientY: options.y ?? 100,
  })
  Object.defineProperties(event, {
    pointerId: { value: options.id ?? 1 },
    pointerType: { value: 'mouse' },
  })
  return event
}

async function clickModel(target: Element) {
  await act(async () => {
    target.dispatchEvent(pointer('pointerdown'))
    target.dispatchEvent(pointer('pointerup'))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function buttonWithText(text: string): HTMLButtonElement | null {
  return [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.trim() === text) ?? null
}

describe('MindMapEditorModal interaction scopes with the real engine', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600,
      x: 0, y: 0, toJSON: () => ({}),
    })
    if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = vi.fn()
    if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = vi.fn()
    if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
    ;(window as any).electronAPI = { file: { downloadImage: vi.fn(async () => undefined) } }
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  async function renderEditor(onSave = vi.fn(async () => undefined)) {
    await act(async () => {
      root.render(<MindMapEditorModal mindmapData={structuredClone(DATA)} isOpen onSave={onSave} onClose={vi.fn()} />)
    })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
    return onSave
  }

  it('renders only the contextual controls for the uniquely selected object type', async () => {
    await renderEditor()
    const node = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'a')!
    await clickModel(node)
    expect(buttonWithText('节点样式')).toBeTruthy()
    expect(buttonWithText('关联样式')).toBeNull()

    const arrow = document.body.querySelector<ArrowSvg>('.topiclinks > g')!
    await clickModel(arrow.querySelector('path') ?? arrow)
    expect(buttonWithText('关联样式')).toBeTruthy()
    expect(buttonWithText('节点信息')).toBeNull()
    expect(buttonWithText('概要样式')).toBeNull()

    const summary = document.body.querySelector<SummarySvg>('.summary > g')!
    await clickModel(summary.querySelector('path') ?? summary)
    expect(buttonWithText('概要样式')).toBeTruthy()
    expect(buttonWithText('关联样式')).toBeNull()
  })

  it('keeps the context menu outside the engine and executes its explicit target action without panning', async () => {
    await renderEditor()
    const node = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'a')!
    const map = document.body.querySelector<HTMLElement>('.map-canvas')!
    const beforeTransform = map.style.transform
    await act(async () => {
      node.dispatchEvent(pointer('pointerdown', { button: 2, x: 160, y: 140 }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const menu = document.body.querySelector<HTMLElement>('[data-mindmap-context-menu]')!
    expect(menu).toBeTruthy()
    expect(menu.closest('[data-mindmap-floating-layer]')).toBeTruthy()
    expect(menu.closest('[data-mindmap-engine-host]')).toBeNull()
    act(() => {
      menu.dispatchEvent(pointer('pointermove', { x: 220, y: 180 }))
      menu.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }))
    })
    expect(map.style.transform).toBe(beforeTransform)

    await act(async () => {
      ;[...menu.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.startsWith('新增子节点'))!.click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(document.body.querySelector('[data-mindmap-context-menu]')).toBeNull()
    expect(document.body.querySelectorAll('me-tpc')).toHaveLength(4)
  })

  it('closes an old menu and selects another object with the same pointerdown', async () => {
    await renderEditor()
    const node = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'a')!
    await act(async () => {
      node.dispatchEvent(pointer('pointerdown', { button: 2 }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.querySelector('[data-mindmap-context-menu]')).toBeTruthy()

    const arrow = document.body.querySelector<ArrowSvg>('.topiclinks > g')!
    await clickModel(arrow.querySelector('path') ?? arrow)
    expect(document.body.querySelector('[data-mindmap-context-menu]')).toBeNull()
    expect(buttonWithText('关联样式')).toBeTruthy()
    expect(buttonWithText('节点样式')).toBeNull()
  })

  it('keeps note content in the floating scope and switches to another object in one click', async () => {
    await renderEditor()
    const arrow = document.body.querySelector<ArrowSvg>('.topiclinks > g')!
    await clickModel(arrow.querySelector('path') ?? arrow)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
    const marker = document.body.querySelector<HTMLButtonElement>('[data-mindmap-note-control]')!
    await act(async () => {
      marker.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const note = [...document.body.querySelectorAll<HTMLElement>('[data-mindmap-floating-control]')]
      .find((element) => element.textContent?.includes('节点 A 备注'))
    expect(note?.closest('[data-mindmap-floating-layer]')).toBeTruthy()
    expect(note?.closest('[data-mindmap-engine-host]')).toBeNull()
    expect(buttonWithText('节点样式')).toBeTruthy()
    expect(buttonWithText('关联样式')).toBeNull()

    await clickModel(arrow.querySelector('path') ?? arrow)
    expect(document.body.textContent).not.toContain('节点 A 备注')
    expect(buttonWithText('关联样式')).toBeTruthy()
  })

  it('creates and reconnects a relation as two exclusive workflows', async () => {
    const onSave = await renderEditor()
    const nodeA = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'a')!
    const rootNode = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'root')!
    await clickModel(nodeA)
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="创建关联"]')!.click())
    await act(async () => {
      rootNode.dispatchEvent(pointer('pointerdown'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.querySelectorAll('.topiclinks > g')).toHaveLength(2)
    expect(buttonWithText('更换终点')).toBeTruthy()

    act(() => buttonWithText('更换终点')!.click())
    const nodeB = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'b')!
    await act(async () => {
      nodeB.dispatchEvent(pointer('pointerdown'))
      await new Promise((resolve) => setTimeout(resolve, 550))
    })
    expect(onSave).toHaveBeenCalled()
    const saved = onSave.mock.calls.at(-1)?.[0] as MindMapData
    const created = saved.arrows?.find((arrow) => arrow.id !== 'arrow-a')
    expect(created).toMatchObject({ from: 'a', to: 'b', label: '关联' })

    act(() => buttonWithText('更换起点')!.click())
    expect(document.body.textContent).toContain('请选择新的起点')
    await act(async () => {
      rootNode.dispatchEvent(pointer('pointerdown'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).not.toContain('请选择新的起点')
    const liveArrow = [...document.body.querySelectorAll<ArrowSvg>('.topiclinks > g')]
      .find((candidate) => candidate.arrowObj.id !== 'arrow-a')
    expect(liveArrow?.arrowObj).toMatchObject({ from: 'root', to: 'b' })
    expect(document.body.textContent).toContain('未保存')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)) })
    expect(onSave).toHaveBeenCalledTimes(2)
    const reconnected = (onSave.mock.calls.at(-1)?.[0] as MindMapData).arrows
      ?.find((arrow) => arrow.id !== 'arrow-a')
    expect(reconnected).toMatchObject({ from: 'root', to: 'b', label: '关联' })
  })

  it('cancels invalid relation targets without mutation or a stale workflow', async () => {
    const onSave = await renderEditor()
    const nodeA = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'a')!
    await clickModel(nodeA)
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="创建关联"]')!.click())
    await act(async () => {
      nodeA.dispatchEvent(pointer('pointerdown'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.querySelectorAll('.topiclinks > g')).toHaveLength(1)
    expect(document.body.textContent).not.toContain('请选择关联目标')

    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="创建关联"]')!.click())
    await act(async () => {
      document.body.querySelector<HTMLElement>('.map-container')!.dispatchEvent(pointer('pointerdown'))
      await new Promise((resolve) => setTimeout(resolve, 550))
    })
    expect(document.body.querySelectorAll('.topiclinks > g')).toHaveLength(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps explicit hand pan and pointer cancellation inside the viewport scope', async () => {
    await renderEditor()
    const node = [...document.body.querySelectorAll<Topic>('me-tpc')].find((topic) => topic.nodeObj.id === 'a')!
    const map = document.body.querySelector<HTMLElement>('.map-canvas')!
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="抓手工具"]')!.click())
    const before = map.style.transform

    await act(async () => {
      node.dispatchEvent(pointer('pointerdown', { x: 20, y: 20, id: 31 }))
      node.dispatchEvent(pointer('pointermove', { x: 70, y: 45, id: 31 }))
      node.dispatchEvent(pointer('pointerup', { x: 70, y: 45, id: 31 }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(map.style.transform).not.toBe(before)

    act(() => {
      node.dispatchEvent(pointer('pointerdown', { x: 70, y: 45, id: 32 }))
      node.dispatchEvent(pointer('pointercancel', { x: 70, y: 45, id: 32 }))
    })
    const cancelledAt = map.style.transform
    act(() => node.dispatchEvent(pointer('pointermove', { x: 120, y: 100, id: 32 })))
    expect(map.style.transform).toBe(cancelledAt)
  })

  it('selects and deletes a summary without changing its covered nodes', async () => {
    await renderEditor()
    const summary = document.body.querySelector<SummarySvg>('.summary > g')!
    const target = summary.querySelector('path') ?? summary
    await clickModel(target)
    expect(document.body.querySelector<HTMLButtonElement>('[aria-label="删除概要"]')).toBeTruthy()
    await act(async () => {
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const editor = document.body.querySelector<HTMLElement>('#input-box')!
    expect(editor).toBeTruthy()
    act(() => editor.blur())
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="删除概要"]')!.click())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(document.body.querySelector('.summary > g')).toBeNull()
    expect(document.body.querySelectorAll('me-tpc')).toHaveLength(3)
  })
})
