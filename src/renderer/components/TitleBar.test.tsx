import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../stores/appStore'
import TitleBar from './TitleBar'

describe('TitleBar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useAppStore.setState({ sidebarOpen: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('keeps the window draggable while the sidebar control is isolated as no-drag', async () => {
    act(() => root.render(<TitleBar />))
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="收起侧边栏"]')!
    expect(button).toBeTruthy()
    expect(button.dataset.appRegion).toBe('no-drag')
    expect((button.closest('.flex-1') as HTMLElement).dataset.appRegion).toBe('drag')
    await act(async () => {
      button.focus()
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    expect(document.body.textContent).toContain('收起侧边栏')
    act(() => button.click())
    expect(useAppStore.getState().sidebarOpen).toBe(false)
    expect(container.querySelector('[aria-label="展开侧边栏"]')).toBeTruthy()
  })
})
