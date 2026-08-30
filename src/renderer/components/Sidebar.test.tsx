import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../stores/appStore'
import { VAULT_FORMAT_VERSIONS } from '@shared/knowledge-types'

vi.mock('./DocumentTree', () => ({ default: () => null }))

import Sidebar from './Sidebar'

const VAULT = {
  schemaVersion: 3 as const,
  formatVersions: VAULT_FORMAT_VERSIONS,
  id: '11111111-1111-4111-8111-111111111111',
  name: '读书笔记',
  createdAt: '',
}

describe('Sidebar vault menu', () => {
  let container: HTMLDivElement
  let root: Root
  const renameVault = vi.fn(async () => true)
  const createVault = vi.fn(async () => VAULT)
  const deleteVault = vi.fn(async () => true)
  const switchVault = vi.fn(async () => undefined)
  const setSettingsOpen = vi.fn()

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.clearAllMocks()
    useAppStore.setState({
      vaults: [VAULT],
      currentVault: null,
      renameVault,
      createVault,
      deleteVault,
      switchVault,
      setSettingsOpen,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function openVaultMenu() {
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择知识库"]')!
    act(() => trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
  }

  function openVaultActions() {
    openVaultMenu()
    const manage = document.body.querySelector<HTMLElement>('[aria-label="管理知识库 读书笔记"]')!
    act(() => {
      manage.focus()
      manage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
  }

  it('opens the vault actions submenu and renames in a dialog', async () => {
    act(() => root.render(<Sidebar />))
    openVaultActions()
    const rename = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('重命名'))!
    expect(rename).toBeTruthy()
    await act(async () => {
      rename.click()
      await Promise.resolve()
    })

    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('重命名知识库')
    const input = dialog.querySelector<HTMLInputElement>('#rename-vault-name')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, '新的名字')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === '保存')!.click()
    })

    expect(renameVault).toHaveBeenCalledWith(VAULT.id, '新的名字')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(renameVault).toHaveBeenCalledTimes(1)
    expect(document.body.style.pointerEvents).not.toBe('none')
    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('设置'))!
      .click())
    expect(setSettingsOpen).toHaveBeenCalledWith(true)
  })

  it('switches immediately from the vault name without a secondary switch action', async () => {
    act(() => root.render(<Sidebar />))
    openVaultMenu()
    const switchItem = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.trim() === VAULT.name)!
    expect(document.body.textContent).not.toContain('切换到此知识库')
    await act(async () => switchItem.click())
    expect(switchVault).toHaveBeenCalledOnce()
    expect(switchVault).toHaveBeenCalledWith(VAULT)
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('creates a named vault from the dialog and rejects an empty name', async () => {
    act(() => root.render(<Sidebar />))
    openVaultMenu()
    const createItem = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('新建知识库'))!
    await act(async () => {
      createItem.click()
      await Promise.resolve()
    })
    const dialog = document.body.querySelector('[role="dialog"]')!
    const input = dialog.querySelector<HTMLInputElement>('#new-vault-name')!
    const submit = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '创建')!
    expect(submit.disabled).toBe(true)
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, '项目资料')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(submit.disabled).toBe(false)
    act(() => submit.click())
    await act(async () => { await Promise.resolve() })
    expect(createVault).toHaveBeenCalledWith('项目资料')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('keeps delete safe on cancel and deletes only after confirmation', async () => {
    act(() => root.render(<Sidebar />))
    openVaultActions()
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent?.includes('删除'))!
        .click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('此操作无法撤销')
    act(() => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '取消')!
      .click())
    expect(deleteVault).not.toHaveBeenCalled()

    openVaultActions()
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent?.includes('删除'))!
        .click()
      await Promise.resolve()
    })
    await act(async () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '删除')!
      .click())
    expect(deleteVault).toHaveBeenCalledOnce()
    expect(deleteVault).toHaveBeenCalledWith(VAULT.id)
  })

  it('opens settings from the dedicated sidebar action', () => {
    act(() => root.render(<Sidebar />))
    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('设置'))!
      .click())
    expect(setSettingsOpen).toHaveBeenCalledWith(true)
  })
})
