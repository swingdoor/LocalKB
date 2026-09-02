import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MindMapEditorModal from './MindMapEditorModal'
import { useAppStore } from '../stores/appStore'

describe('MindMapEditorModal with the real Mind Elixir instance', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    useAppStore.setState({ generalSettings: { editorFont: 'system', applicationTheme: 'classic' } })
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
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('keeps the editor alive when adding a sibling to one selected child', async () => {
    const onSave = vi.fn(async () => undefined)
    await act(async () => {
      root.render(<MindMapEditorModal
        mindmapData={{ nodeData: { id: 'root', topic: '中心主题', children: [{ id: 'child', topic: '已有节点' }] } }}
        isOpen
        onSave={onSave}
        onClose={vi.fn()}
      />)
    })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
    const child = [...document.body.querySelectorAll<any>('me-tpc')]
      .find((topic) => topic.nodeObj?.id === 'child')!
    const pointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } })
      return event
    }
    act(() => {
      child.dispatchEvent(pointer('pointerdown'))
      child.dispatchEvent(pointer('pointerup'))
      child.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    const addSibling = document.body.querySelector<HTMLButtonElement>('[aria-label="在后面新增同级节点"]')!
    expect(addSibling.disabled).toBe(false)
    await act(async () => {
      addSibling.click()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)) })

    expect(document.body.textContent).toContain('编辑思维导图')
    expect(document.body.querySelectorAll('me-tpc')).toHaveLength(3)
    expect(document.body.querySelector('#input-box')).toBeTruthy()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('changes the live screen theme without rebuilding topics or changing mind-map data', async () => {
    const data = { nodeData: { id: 'root', topic: '中心主题', children: [{ id: 'child', topic: '已有节点' }] } }
    await act(async () => {
      root.render(<MindMapEditorModal
        mindmapData={structuredClone(data)}
        isOpen
        onSave={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />)
    })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
    const rootTopic = [...document.body.querySelectorAll<any>('me-tpc')]
      .find((topic) => topic.nodeObj?.id === 'root')!

    await act(async () => {
      useAppStore.setState({ generalSettings: { editorFont: 'system', applicationTheme: 'night' } })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect([...document.body.querySelectorAll<any>('me-tpc')]
      .find((topic) => topic.nodeObj?.id === 'root')).toBe(rootTopic)
    expect(rootTopic.nodeObj.topic).toBe('中心主题')
    expect(document.body.querySelectorAll('me-tpc')).toHaveLength(2)
    expect(document.body.querySelector<HTMLElement>('[data-mindmap-editor-surface]')?.style.backgroundColor)
      .toBe('var(--resource-mindmap-surface)')
  })
})
