import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchModal from './SearchModal'

const hit = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: '产品设计',
  contentType: 'document' as const,
  path: ['工作'],
  updatedAt: '2026-08-29T00:00:00.000Z',
}

describe('SearchModal', () => {
  let container: HTMLDivElement
  let root: Root
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const search = vi.fn(async () => ({ ok: true as const, data: [hit] }))

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    HTMLElement.prototype.scrollIntoView = () => undefined
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    ;(window as any).electronAPI = { knowledge: { search } }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    onSelect.mockClear()
    onClose.mockClear()
    search.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('debounces search and delegates keyboard selection and Escape to Command/Dialog', async () => {
    act(() => root.render(<SearchModal vaultId="vault" onSelect={onSelect} onClose={onClose} />))
    expect(document.activeElement).toBe(document.body.querySelector('[cmdk-input]'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })
    expect(search).toHaveBeenCalledWith('vault', '')
    expect(document.body.textContent).toContain('产品设计')
    expect(document.body.textContent).toContain('工作')

    const input = document.body.querySelector<HTMLInputElement>('[cmdk-input]')!
    await act(async () => {
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onSelect).toHaveBeenCalledWith(hit)

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows loading and empty states for a debounced query', async () => {
    let resolveSearch!: (value: { ok: true; data: (typeof hit)[] }) => void
    search.mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve }))
    act(() => root.render(<SearchModal vaultId="vault" onSelect={onSelect} onClose={onClose} />))
    const input = document.body.querySelector<HTMLInputElement>('[cmdk-input]')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, '不存在')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })
    expect(search).toHaveBeenCalledWith('vault', '不存在')
    expect(document.body.textContent).toContain('正在搜索')
    await act(async () => resolveSearch({ ok: true, data: [] }))
    expect(document.body.textContent).toContain('未找到匹配内容')
  })

  it('opens a result exactly once when clicked', async () => {
    act(() => root.render(<SearchModal vaultId="vault" onSelect={onSelect} onClose={onClose} />))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })
    const result = Array.from(document.body.querySelectorAll<HTMLElement>('[cmdk-item]'))
      .find((item) => item.textContent?.includes('产品设计'))!
    act(() => result.click())
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(hit)
  })
})
