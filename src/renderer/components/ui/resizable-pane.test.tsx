import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ResizablePane } from './resizable-pane'

describe('ResizablePane', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    localStorage.removeItem('test-pane-width')
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('resizes from the divider and remembers the chosen width', () => {
    act(() => root.render(
      <ResizablePane
        defaultWidth={240}
        minWidth={200}
        maxWidth={420}
        resizeFrom="east"
        storageKey="test-pane-width"
        separatorLabel="调整测试区域宽度"
      >
        <div>区域内容</div>
      </ResizablePane>,
    ))

    const separator = container.querySelector<HTMLElement>('[role="separator"]')!
    expect(separator.getAttribute('aria-valuenow')).toBe('240')

    act(() => separator.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 100,
    })))
    act(() => document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 124,
    })))
    act(() => document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 124,
    })))

    expect(container.querySelector<HTMLElement>('[data-resizable-pane]')?.style.width).toBe('264px')
    expect(localStorage.getItem('test-pane-width')).toBe('264')

    act(() => separator.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
    })))

    expect(container.querySelector<HTMLElement>('[data-resizable-pane]')?.style.width).toBe('276px')
    expect(localStorage.getItem('test-pane-width')).toBe('276')
  })
})
