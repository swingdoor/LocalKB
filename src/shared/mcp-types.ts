import type { JsonValue, KnowledgeErrorData } from './knowledge-types'

export interface McpSettings {
  enabled: boolean
  port: number
  token: string
}

export type McpRuntimeState = 'disabled' | 'starting' | 'running' | 'error'
export type McpErrorCode = 'PORT_IN_USE'

export interface McpStatus {
  state: McpRuntimeState
  port: number
  endpoint: string
  error?: string
  errorCode?: McpErrorCode
}

export type McpToolResult<T extends JsonValue = JsonValue> =
  | { ok: true; data: T }
  | { ok: false; error: KnowledgeErrorData }

export interface PublicMcpSettings {
  enabled: boolean
  port: number
  maskedToken: string
}

export function maskMcpSettings(settings: McpSettings): PublicMcpSettings {
  return {
    enabled: settings.enabled,
    port: settings.port,
    maskedToken: `${settings.token.slice(0, 4)}••••${settings.token.slice(-4)}`,
  }
}
