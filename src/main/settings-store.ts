import * as fs from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { app } from 'electron'
import type { AISettings, GeneralSettings, HotkeyConfig } from '../shared/types'
import type { McpSettings } from '../shared/mcp-types'
import { DEFAULT_HOTKEYS } from '../shared/types'
import { getAIProvider, isAIProviderId } from '../shared/ai-providers'
import { DEFAULT_GENERAL_SETTINGS, isEditorFontId } from '../shared/editor-fonts'

interface SettingsData {
  general?: Partial<GeneralSettings>
  ai?: Partial<AISettings>
  hotkeys?: HotkeyConfig[]
  mcp?: Partial<McpSettings>
}

function normalizeGeneralSettings(value: Partial<GeneralSettings>): GeneralSettings {
  return {
    editorFont: isEditorFontId(value.editorFont)
      ? value.editorFont
      : DEFAULT_GENERAL_SETTINGS.editorFont,
  }
}

const defaultMcpSettings = (): McpSettings => ({
  enabled: false,
  port: 17890,
  token: randomBytes(32).toString('base64url'),
})

function normalizeMcpSettings(value: Partial<McpSettings>, fallback?: McpSettings): McpSettings {
  const defaults = fallback ?? defaultMcpSettings()
  const enabled = value.enabled ?? defaults.enabled
  const port = value.port ?? defaults.port
  const token = value.token ?? defaults.token
  if (typeof enabled !== 'boolean') throw new Error('MCP 启用状态无效')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MCP 端口须为 1024–65535')
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) throw new Error('MCP 令牌无效')
  return { enabled, port, token }
}

const defaultAISettings: AISettings = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: getAIProvider('deepseek').baseUrl,
  model: 'deepseek-v4-flash',
  polishPrompt: '请对以下文本进行润色，使其更加流畅、专业，同时保持原意不变。只返回润色后的文本，不要添加任何解释或说明：\n\n',
  expandPrompt: '请对以下文本进行扩写，丰富内容细节，增加相关论述，使其更加完整充实。只返回扩写后的文本，不要添加任何解释或说明：\n\n',
}

function normalizeAISettings(value: Partial<AISettings>): AISettings {
  const provider = isAIProviderId(value.provider) ? value.provider : defaultAISettings.provider
  const merged = { ...defaultAISettings, ...value, provider }
  const configuredBaseUrl = typeof merged.baseUrl === 'string' ? merged.baseUrl.trim() : ''
  const baseUrl = provider === 'custom' ? configuredBaseUrl : getAIProvider(provider).baseUrl
  return {
    ...merged,
    baseUrl,
    apiKey: typeof merged.apiKey === 'string' ? merged.apiKey : '',
    model: typeof merged.model === 'string' ? merged.model.trim() : '',
  }
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'data', 'settings.json')
}

function readSettings(): SettingsData {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as SettingsData } catch { return {} }
}

function writeSettings(value: SettingsData): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(value, null, 2), 'utf8')
}

export const settingsStore = {
  getGeneralSettings(): GeneralSettings {
    return normalizeGeneralSettings(readSettings().general ?? {})
  },
  saveGeneralSettings(patch: Partial<GeneralSettings>): GeneralSettings {
    const settings = readSettings()
    const general = normalizeGeneralSettings({ ...settings.general, ...patch })
    writeSettings({ ...settings, general })
    return general
  },
  getAISettings(): AISettings {
    return normalizeAISettings(readSettings().ai ?? {})
  },
  saveAISettings(patch: Partial<AISettings>): AISettings {
    const settings = readSettings()
    const ai = normalizeAISettings({ ...settings.ai, ...patch })
    writeSettings({ ...settings, ai })
    return ai
  },
  getHotkeys(): HotkeyConfig[] {
    const saved = readSettings().hotkeys ?? []
    if (!saved.length) return DEFAULT_HOTKEYS
    return DEFAULT_HOTKEYS.map((fallback) => (
      saved.find((hotkey) => hotkey.id === fallback.id) ?? fallback
    ))
  },
  saveHotkeys(hotkeys: HotkeyConfig[]): HotkeyConfig[] {
    writeSettings({ ...readSettings(), hotkeys: hotkeys.filter((hotkey) => !hotkey.readonly) })
    return hotkeys
  },
  getMcpSettings(): McpSettings {
    const settings = readSettings()
    const mcp = normalizeMcpSettings(settings.mcp ?? {})
    if (!settings.mcp?.token) writeSettings({ ...settings, mcp })
    return mcp
  },
  saveMcpSettings(value: McpSettings): McpSettings {
    const mcp = normalizeMcpSettings(value)
    writeSettings({ ...readSettings(), mcp })
    return mcp
  },
  createMcpToken(): string {
    return randomBytes(32).toString('base64url')
  },
}
