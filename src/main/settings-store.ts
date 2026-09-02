import * as path from 'path'
import { randomBytes } from 'crypto'
import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import type { AISettings, GeneralSettings, HotkeyConfig } from '../shared/types'
import type { McpSettings } from '../shared/mcp-types'
import { DEFAULT_HOTKEYS } from '../shared/types'
import { getAIProvider, isAIProviderId } from '../shared/ai-providers'
import { DEFAULT_GENERAL_SETTINGS, isEditorFontId } from '../shared/editor-fonts'
import { normalizeApplicationTheme } from '../shared/application-themes'
import { atomicCommitFile, type AtomicFileSystem } from './storage/atomic-file'

const SETTINGS_SCHEMA_VERSION = 1

export type SettingsErrorCode =
  | 'MISSING'
  | 'MALFORMED'
  | 'UNSUPPORTED_VERSION'
  | 'ENCRYPTION_UNAVAILABLE'
  | 'UNDECRYPTABLE'
  | 'PERSISTENCE_ERROR'

export class SettingsStoreError extends Error {
  constructor(readonly code: SettingsErrorCode, message: string) {
    super(message)
    this.name = 'SettingsStoreError'
  }
}

export interface SettingsSafeStorage {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface PlainSettings {
  general: GeneralSettings
  ai: AISettings
  hotkeys: HotkeyConfig[]
  mcp: McpSettings
  extras: Record<string, unknown>
}

interface PersistedSettingsV1 extends Record<string, unknown> {
  schemaVersion: 1
  general: GeneralSettings
  ai: Omit<AISettings, 'apiKey'> & { apiKeyEncrypted: EncryptedSecret }
  hotkeys: HotkeyConfig[]
  mcp: Omit<McpSettings, 'token'> & { tokenEncrypted: EncryptedSecret }
}

interface EncryptedSecret {
  encoding: 'safeStorage-base64'
  ciphertext: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeGeneralSettings(value: Partial<GeneralSettings>): GeneralSettings {
  return {
    editorFont: isEditorFontId(value.editorFont)
      ? value.editorFont
      : DEFAULT_GENERAL_SETTINGS.editorFont,
    applicationTheme: normalizeApplicationTheme(value.applicationTheme),
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
  if (typeof enabled !== 'boolean') throw new SettingsStoreError('MALFORMED', 'MCP 启用状态无效')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new SettingsStoreError('MALFORMED', 'MCP 端口须为 1024–65535')
  }
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
    throw new SettingsStoreError('MALFORMED', 'MCP 令牌无效')
  }
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

function normalizeHotkeys(value: unknown): HotkeyConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOTKEYS.map((entry) => ({ ...entry }))
  return DEFAULT_HOTKEYS.map((fallback) => {
    const saved = value.find((item) => isRecord(item) && item.id === fallback.id)
    if (!saved || typeof saved.key !== 'string') return { ...fallback }
    return { ...fallback, key: saved.key }
  })
}

function extraFields(raw: Record<string, unknown>): Record<string, unknown> {
  const excluded = new Set(['schemaVersion', 'general', 'ai', 'hotkeys', 'mcp'])
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !excluded.has(key)))
}

export class SettingsStore {
  private current: PlainSettings | null = null

  constructor(
    private readonly userDataPath: () => string,
    private readonly encryption: SettingsSafeStorage,
    private readonly fileSystem: typeof fs = fs,
  ) {}

  private filePath(): string {
    return path.join(this.userDataPath(), 'data', 'settings.json')
  }

  private requireCurrent(): PlainSettings {
    if (!this.current) throw new SettingsStoreError('MISSING', '设置存储尚未初始化')
    return this.current
  }

  private requireEncryption(): void {
    if (!this.encryption.isEncryptionAvailable()) {
      throw new SettingsStoreError('ENCRYPTION_UNAVAILABLE', '系统安全存储当前不可用')
    }
  }

  private encrypt(value: string): EncryptedSecret {
    this.requireEncryption()
    try {
      return {
        encoding: 'safeStorage-base64',
        ciphertext: this.encryption.encryptString(value).toString('base64'),
      }
    }
    catch { throw new SettingsStoreError('PERSISTENCE_ERROR', '设置密钥加密失败') }
  }

  private decrypt(value: unknown, label: string): string {
    this.requireEncryption()
    if (!isRecord(value) || value.encoding !== 'safeStorage-base64' ||
      typeof value.ciphertext !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext)) {
      throw new SettingsStoreError('MALFORMED', `${label}密文无效`)
    }
    try { return this.encryption.decryptString(Buffer.from(value.ciphertext, 'base64')) }
    catch { throw new SettingsStoreError('UNDECRYPTABLE', `${label}无法解密`) }
  }

  private persisted(settings: PlainSettings): PersistedSettingsV1 {
    const { apiKey, ...ai } = settings.ai
    const { token, ...mcp } = settings.mcp
    return {
      ...settings.extras,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      general: settings.general,
      ai: { ...ai, apiKeyEncrypted: this.encrypt(apiKey) },
      hotkeys: settings.hotkeys.filter((hotkey) => !hotkey.readonly),
      mcp: { ...mcp, tokenEncrypted: this.encrypt(token) },
    }
  }

  private async commit(settings: PlainSettings): Promise<void> {
    const value = `${JSON.stringify(this.persisted(settings), null, 2)}\n`
    try {
      await atomicCommitFile(this.fileSystem as unknown as AtomicFileSystem, this.filePath(), value)
    } catch (error) {
      if (error instanceof SettingsStoreError) throw error
      throw new SettingsStoreError('PERSISTENCE_ERROR', '原子保存设置失败')
    }
    this.current = settings
  }

  private parsePlainV0(raw: Record<string, unknown>): PlainSettings {
    return {
      general: normalizeGeneralSettings(isRecord(raw.general) ? raw.general : {}),
      ai: normalizeAISettings(isRecord(raw.ai) ? raw.ai : {}),
      hotkeys: normalizeHotkeys(raw.hotkeys),
      mcp: normalizeMcpSettings(isRecord(raw.mcp) ? raw.mcp : {}),
      extras: extraFields(raw),
    }
  }

  private parseV1(raw: Record<string, unknown>): PlainSettings {
    if (!isRecord(raw.ai) || !isRecord(raw.mcp)) {
      throw new SettingsStoreError('MALFORMED', '设置密文结构无效')
    }
    const apiKey = this.decrypt(raw.ai.apiKeyEncrypted, 'AI API Key')
    const token = this.decrypt(raw.mcp.tokenEncrypted, 'MCP 令牌')
    return {
      general: normalizeGeneralSettings(isRecord(raw.general) ? raw.general : {}),
      ai: normalizeAISettings({ ...raw.ai, apiKey }),
      hotkeys: normalizeHotkeys(raw.hotkeys),
      mcp: normalizeMcpSettings({ ...raw.mcp, token }),
      extras: extraFields(raw),
    }
  }

  async initialize(): Promise<void> {
    this.current = null
    let rawText: string
    try {
      rawText = await this.fileSystem.readFile(this.filePath(), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new SettingsStoreError('PERSISTENCE_ERROR', '读取设置失败')
      }
      await this.commit({
        general: { ...DEFAULT_GENERAL_SETTINGS },
        ai: { ...defaultAISettings },
        hotkeys: DEFAULT_HOTKEYS.map((entry) => ({ ...entry })),
        mcp: defaultMcpSettings(),
        extras: {},
      })
      return
    }

    let raw: unknown
    try { raw = JSON.parse(rawText) }
    catch { throw new SettingsStoreError('MALFORMED', '设置文件不是有效 JSON') }
    if (!isRecord(raw)) throw new SettingsStoreError('MALFORMED', '设置文件结构无效')
    if (raw.schemaVersion === undefined) {
      await this.commit(this.parsePlainV0(raw))
      return
    }
    if (raw.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      throw new SettingsStoreError('UNSUPPORTED_VERSION', '不支持的设置文件版本')
    }
    this.current = this.parseV1(raw)
  }

  getGeneralSettings(): GeneralSettings { return { ...this.requireCurrent().general } }

  async saveGeneralSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings> {
    const current = this.requireCurrent()
    const general = normalizeGeneralSettings({ ...current.general, ...patch })
    await this.commit({ ...current, general })
    return { ...general }
  }

  getAISettings(): AISettings { return { ...this.requireCurrent().ai } }

  async saveAISettings(patch: Partial<AISettings>): Promise<AISettings> {
    const current = this.requireCurrent()
    const ai = normalizeAISettings({ ...current.ai, ...patch })
    await this.commit({ ...current, ai })
    return { ...ai }
  }

  getHotkeys(): HotkeyConfig[] { return this.requireCurrent().hotkeys.map((entry) => ({ ...entry })) }

  async saveHotkeys(hotkeys: HotkeyConfig[]): Promise<HotkeyConfig[]> {
    const current = this.requireCurrent()
    const normalized = normalizeHotkeys(hotkeys)
    await this.commit({ ...current, hotkeys: normalized })
    return normalized.map((entry) => ({ ...entry }))
  }

  getMcpSettings(): McpSettings { return { ...this.requireCurrent().mcp } }

  async saveMcpSettings(value: McpSettings): Promise<McpSettings> {
    const current = this.requireCurrent()
    const mcp = normalizeMcpSettings(value)
    await this.commit({ ...current, mcp })
    return { ...mcp }
  }

  createMcpToken(): string { return randomBytes(32).toString('base64url') }
}

export const settingsStore = new SettingsStore(
  () => app.getPath('userData'),
  safeStorage,
)
