import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../stores/appStore'

vi.mock('./DocumentTree', () => ({ default: () => null }))

import Sidebar from './Sidebar'

const VAULT = {
  schemaVersion: 2 as const,
  id: '11111111-1111-4111-8111-111111111111',
  name: '读书笔记',
  createdAt: '',
}

describe('Sidebar vault menu', () => {
  let container: HTMLDivElement
  let root: Root
  const renameVault = vi.fn(async () => true)

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    renameVault.mockClear()
    useAppStore.setState({
      vaults: [VAULT],
      currentVault: null,
      renameVault,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('opens the More menu to the right and renames in a dialog', async () => {
    act(() => root.render(<Sidebar />))
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="选择知识库"]')!.click())
    const manage = container.querySelector<HTMLButtonElement>('button[aria-label="管理知识库 读书笔记"]')!
    vi.spyOn(manage, 'getBoundingClientRect').mockReturnValue({
      bottom: 68, height: 28, left: 172, right: 200, top: 40, width: 28, x: 172, y: 40,
      toJSON: () => ({}),
    })
    act(() => manage.click())

    const menu = container.querySelector('[role="menu"]')!
    expect(menu.textContent).toContain('重命名')
    expect(menu.textContent).toContain('删除')
    expect((menu as HTMLElement).style.left).toBe('208px')
    const rename = Array.from(menu.querySelectorAll('button')).find((button) => button.textContent?.includes('重命名'))!
    act(() => rename.click())

    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('重命名知识库')
    const input = dialog.querySelector<HTMLInputElement>('#rename-vault-input')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, '新的名字')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(renameVault).toHaveBeenCalledWith(VAULT.id, '新的名字')
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    act(() => manage.click())
    const reopenedMenu = container.querySelector('[role="menu"]')!
    const renameAgain = Array.from(reopenedMenu.querySelectorAll('button')).find((button) => button.textContent?.includes('重命名'))!
    act(() => renameAgain.click())
    const cancelInput = container.querySelector<HTMLInputElement>('#rename-vault-input')!
    act(() => cancelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(renameVault).toHaveBeenCalledTimes(1)
  })
})
