import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommandMenu from './CommandMenu'

describe('CommandMenu keyboard navigation', () => {
  let host: HTMLDivElement
  let root: Root
  let scrollIntoView: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('scrolls the active command into view for Tab and ArrowDown navigation', async () => {
    await act(async () => {
      root.render(
        <CommandMenu
          position={{ x: 20, y: 20 }}
          searchQuery=""
          onSearchChange={vi.fn()}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    scrollIntoView.mockClear()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
    expect(document.body.querySelector('[data-command-index="1"]')?.getAttribute('aria-selected')).toBe('true')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })

    scrollIntoView.mockClear()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.body.querySelector('[data-command-index="2"]')?.getAttribute('aria-selected')).toBe('true')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })
})
