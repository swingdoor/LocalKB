import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsModal from './SettingsModal'

describe('SettingsModal MCP panel', () => {
  let container: HTMLDivElement
  let root: Root
  let enabled: boolean
  let connectionUrl: string
  const saveMcp = vi.fn(async (nextEnabled: boolean) => {
    enabled = nextEnabled
    return { enabled, port: 17890, maskedToken: 'abcd••••wxyz' }
  })
  const resetMcpToken = vi.fn(async () => {
    connectionUrl = 'http://127.0.0.1:17890/mcp?token=new-token'
    return { enabled, port: 17890, maskedToken: 'new-••••oken' }
  })
  const copyMcpUrl = vi.fn(async () => true)
  const saveAI = vi.fn(async () => true)
  const saveHotkeys = vi.fn(async () => true)
  const onClose = vi.fn()
  const hotkeys = [
    { id: 'search', name: '打开搜索', key: 'k', modifiers: ['ctrl'], display: 'Ctrl+K' },
    { id: 'imageCommand', name: '图片命令', key: 'i', modifiers: ['ctrl', 'shift'], display: 'Ctrl+Shift+I' },
    { id: 'heading1', name: '标题 1', key: '1', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+1', readonly: true },
  ]

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    enabled = true
    connectionUrl = 'http://127.0.0.1:17890/mcp?token=old-token'
    saveMcp.mockClear()
    resetMcpToken.mockClear()
    copyMcpUrl.mockClear()
    saveAI.mockClear()
    saveHotkeys.mockClear()
    onClose.mockClear()
    ;(window as any).electronAPI = {
      settings: {
        getAI: vi.fn(async () => ({
          provider: 'deepseek', apiKey: 'secret', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash',
          polishPrompt: '', expandPrompt: '',
        })),
        saveAI,
        getHotkeys: vi.fn(async () => hotkeys),
        saveHotkeys,
        getMcp: vi.fn(async () => ({ enabled, port: 17890, maskedToken: 'abcd••••wxyz' })),
        getMcpStatus: vi.fn(async () => ({
          state: enabled ? 'running' : 'disabled',
          port: enabled ? 17890 : 0,
          endpoint: enabled ? 'http://127.0.0.1:17890/mcp' : '',
        })),
        getMcpUrl: vi.fn(async () => connectionUrl),
        saveMcp,
        resetMcpToken,
        copyMcpUrl,
      },
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    HTMLElement.prototype.hasPointerCapture = () => false
    HTMLElement.prototype.setPointerCapture = () => undefined
    HTMLElement.prototype.releasePointerCapture = () => undefined
    HTMLElement.prototype.scrollIntoView = () => undefined
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('shows the stable URL and applies toggle, refresh, and copy immediately', async () => {
    await act(async () => root.render(<SettingsModal isOpen onClose={onClose} />))
    const mcpTab = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent === 'MCP 服务')!
    act(() => {
      mcpTab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      mcpTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      mcpTab.click()
    })

    expect(document.body.textContent).toContain('本地 MCP 服务')
    expect(document.body.textContent).toContain('运行中')
    const url = document.body.querySelector<HTMLInputElement>('input[aria-label="MCP 连接地址"]')!
    expect(url.value).toBe(connectionUrl)

    const toggle = document.body.querySelector<HTMLButtonElement>('button[role="switch"]')!
    await act(async () => toggle.click())
    expect(saveMcp).toHaveBeenCalledWith(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).toContain('已停止')

    const refresh = document.body.querySelector<HTMLButtonElement>('button[aria-label="刷新 MCP 连接地址"]')!
    act(() => refresh.click())
    const cancelRefresh = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent === '取消')!
    act(() => cancelRefresh.click())
    expect(resetMcpToken).not.toHaveBeenCalled()
    act(() => refresh.click())
    const confirmRefresh = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent === '确认刷新')!
    await act(async () => confirmRefresh.click())
    expect(resetMcpToken).toHaveBeenCalledOnce()
    expect(url.value).toBe('http://127.0.0.1:17890/mcp?token=new-token')

    const copy = document.body.querySelector<HTMLButtonElement>('button[aria-label="复制 MCP 连接地址"]')!
    await act(async () => copy.click())
    expect(copyMcpUrl).toHaveBeenCalledOnce()
  })

  it('loads AI settings, toggles password visibility, and saves through the existing APIs', async () => {
    await act(async () => root.render(<SettingsModal isOpen onClose={onClose} />))
    const apiKey = document.body.querySelector<HTMLInputElement>('#api-key')!
    expect(apiKey.value).toBe('secret')
    expect(apiKey.type).toBe('password')
    act(() => document.body.querySelector<HTMLButtonElement>('button[aria-label="显示 API Key"]')!.click())
    expect(apiKey.type).toBe('text')

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(apiKey, 'updated-secret')
      apiKey.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '保存')!
      .click())
    expect(saveAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'updated-secret' }))
    expect(saveHotkeys).toHaveBeenCalledWith(hotkeys.filter((hotkey) => !hotkey.readonly))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows and saves model ID and Base URL for a custom provider', async () => {
    ;(window as any).electronAPI.settings.getAI = vi.fn(async () => ({
      provider: 'custom',
      apiKey: 'custom-secret',
      baseUrl: 'https://old.example.com/v1',
      model: 'old-model',
      polishPrompt: '',
      expandPrompt: '',
    }))
    await act(async () => root.render(<SettingsModal isOpen onClose={onClose} />))

    const model = document.body.querySelector<HTMLInputElement>('#model-id')!
    const baseUrl = document.body.querySelector<HTMLInputElement>('#base-url')!
    expect(model).toBeTruthy()
    expect(baseUrl).toBeTruthy()
    expect(document.body.querySelector('[aria-label="模型提供商"]')?.textContent).toContain('自定义')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(model, 'local-model-v1')
      model.dispatchEvent(new Event('input', { bubbles: true }))
      setValue.call(baseUrl, 'https://localhost:11434/v1')
      baseUrl.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '保存')!
      .click())

    expect(saveAI).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'custom',
      model: 'local-model-v1',
      baseUrl: 'https://localhost:11434/v1',
    }))
  })

  it('reports a shortcut conflict and cancels shortcut recording with Escape', async () => {
    await act(async () => root.render(<SettingsModal isOpen onClose={onClose} />))
    const hotkeyTab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '快捷键')!
    act(() => {
      hotkeyTab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      hotkeyTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      hotkeyTab.click()
    })
    const shortcut = document.body.querySelector<HTMLButtonElement>('button[aria-label="打开搜索 快捷键，双击修改"]')!
    act(() => shortcut.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const recorder = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === '请按组合键…')!
    act(() => recorder.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'i', ctrlKey: true, shiftKey: true, bubbles: true,
    })))
    expect(document.body.textContent).toContain('与“图片命令”冲突')
    act(() => recorder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.body.textContent).not.toContain('与“图片命令”冲突')
    expect(document.body.querySelector('button[aria-label="打开搜索 快捷键，双击修改"]')).toBeTruthy()
    expect(document.body.querySelector('button[aria-label="修改 打开搜索"]')).toBeNull()
    expect(document.body.querySelector('[aria-label="标题 1 快捷键（不可修改）"]')).toBeTruthy()
  })
})
