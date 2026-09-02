import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { McpSettings } from '../../shared/mcp-types'

const mocks = vi.hoisted(() => {
  let current: McpSettings
  const saveMcpSettings = vi.fn(async (value: McpSettings) => {
    current = { ...value }
    return { ...current }
  })
  return {
    reset() {
      current = { enabled: false, port: 17890, token: 'old-token' }
      saveMcpSettings.mockClear()
    },
    settingsStore: {
      getMcpSettings: vi.fn(() => ({ ...current })),
      saveMcpSettings,
      createMcpToken: vi.fn(() => 'new-token'),
    },
    saveMcpSettings,
  }
})

vi.mock('electron', () => ({ clipboard: { writeText: vi.fn() } }))
vi.mock('../settings-store', () => ({ settingsStore: mocks.settingsStore }))

import { McpManager } from './manager'
import type { McpHttpService } from './http-service'

describe('MCP manager endpoint reassignment', () => {
  beforeEach(() => mocks.reset())

  it('starts on a system-assigned port, persists it, and rotates the token', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
    }
    const http = {
      apply: vi.fn(async (settings: McpSettings) => ({
        state: 'running' as const,
        port: settings.port === 0 ? 24680 : settings.port,
        endpoint: 'http://127.0.0.1:24680/mcp',
      })),
      getStatus: vi.fn(),
      connectionUrl: vi.fn(),
      stop: vi.fn(),
    }
    new McpManager(http as unknown as McpHttpService).registerIpc(ipc as never)

    const result = await handlers.get(IPC_CHANNELS.SETTINGS.REASSIGN_MCP_ENDPOINT)?.()

    expect(http.apply).toHaveBeenCalledWith({
      enabled: true, port: 0, token: 'new-token',
    })
    expect(mocks.saveMcpSettings).toHaveBeenCalledWith({
      enabled: true, port: 24680, token: 'new-token',
    })
    expect(result).toEqual({ enabled: true, port: 24680, maskedToken: 'new-••••oken' })
  })
})
