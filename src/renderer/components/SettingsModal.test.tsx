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

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    enabled = true
    connectionUrl = 'http://127.0.0.1:17890/mcp?token=old-token'
    saveMcp.mockClear()
    resetMcpToken.mockClear()
    copyMcpUrl.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    ;(window as any).electronAPI = {
      settings: {
        getAI: vi.fn(async () => ({
          apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
          polishPrompt: '', expandPrompt: '',
        })),
        getHotkeys: vi.fn(async () => []),
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
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('shows the stable URL and applies toggle, refresh, and copy immediately', async () => {
    await act(async () => root.render(<SettingsModal isOpen onClose={() => undefined} />))
    const mcpTab = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'MCP 服务')!
    act(() => mcpTab.click())

    expect(container.textContent).toContain('本地 MCP 服务')
    expect(container.textContent).toContain('运行中')
    const url = container.querySelector<HTMLInputElement>('input[aria-label="MCP 连接地址"]')!
    expect(url.value).toBe(connectionUrl)

    const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"]')!
    expect(toggle.className).toContain('h-6 w-11')
    expect(toggle.querySelector('span')?.className).toContain('left-0.5')
    await act(async () => toggle.click())
    expect(saveMcp).toHaveBeenCalledWith(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(container.textContent).toContain('已停止')

    const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="刷新 MCP 连接地址"]')!
    await act(async () => refresh.click())
    expect(resetMcpToken).toHaveBeenCalledOnce()
    expect(url.value).toBe('http://127.0.0.1:17890/mcp?token=new-token')

    const copy = container.querySelector<HTMLButtonElement>('button[aria-label="复制 MCP 连接地址"]')!
    await act(async () => copy.click())
    expect(copyMcpUrl).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('连接地址已复制')
  })
})
