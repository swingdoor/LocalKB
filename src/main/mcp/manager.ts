import { clipboard, type IpcMain } from 'electron'
import { maskMcpSettings } from '../../shared/mcp-types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { settingsStore } from '../settings-store'
import { McpHttpService } from './http-service'

export class McpManager {
  private registered = false

  constructor(private readonly http: McpHttpService) {}

  async start(): Promise<void> {
    const settings = settingsStore.getMcpSettings()
    if (!settings.enabled) return
    await this.http.apply(settings)
  }

  registerIpc(ipc: IpcMain): void {
    if (this.registered) return
    this.registered = true
    ipc.handle(IPC_CHANNELS.SETTINGS.GET_MCP, () => maskMcpSettings(settingsStore.getMcpSettings()))
    ipc.handle(IPC_CHANNELS.SETTINGS.GET_MCP_STATUS, () => this.http.getStatus())
    ipc.handle(IPC_CHANNELS.SETTINGS.GET_MCP_URL, () => (
      this.http.connectionUrl(settingsStore.getMcpSettings())
    ))
    ipc.handle(IPC_CHANNELS.SETTINGS.SAVE_MCP, async (_event, enabled: boolean) => {
      if (typeof enabled !== 'boolean') throw new Error('MCP 启用状态无效')
      const previous = settingsStore.getMcpSettings()
      const next = { ...previous, enabled }
      await settingsStore.saveMcpSettings(next)
      try { await this.http.apply(next) }
      catch (error) {
        await settingsStore.saveMcpSettings(previous)
        throw error
      }
      return maskMcpSettings(next)
    })
    ipc.handle(IPC_CHANNELS.SETTINGS.RESET_MCP_TOKEN, async () => {
      const previous = settingsStore.getMcpSettings()
      const next = { ...previous, token: settingsStore.createMcpToken() }
      await settingsStore.saveMcpSettings(next)
      try { await this.http.apply(next) }
      catch (error) {
        await settingsStore.saveMcpSettings(previous)
        await this.http.apply(previous).catch(() => undefined)
        throw error
      }
      return maskMcpSettings(next)
    })
    ipc.handle(IPC_CHANNELS.SETTINGS.REASSIGN_MCP_ENDPOINT, async () => {
      const previous = settingsStore.getMcpSettings()
      const candidate = {
        ...previous,
        enabled: true,
        port: 0,
        token: settingsStore.createMcpToken(),
      }
      try {
        const status = await this.http.apply(candidate)
        if (status.state !== 'running' || status.port <= 0) {
          throw new Error('未能分配可用的 MCP 端口')
        }
        const next = { ...candidate, port: status.port }
        await settingsStore.saveMcpSettings(next)
        return maskMcpSettings(next)
      } catch (error) {
        await this.http.apply(previous).catch(() => undefined)
        throw error
      }
    })
    ipc.handle(IPC_CHANNELS.SETTINGS.COPY_MCP_URL, async () => {
      const settings = settingsStore.getMcpSettings()
      await clipboard.writeText(this.http.connectionUrl(settings))
      return true
    })
  }

  stop(): Promise<void> {
    return this.http.stop()
  }
}
