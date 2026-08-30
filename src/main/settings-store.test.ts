import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore, SettingsStoreError, type SettingsSafeStorage } from './settings-store'

class TestSafeStorage implements SettingsSafeStorage {
  available = true
  failDecrypt = false

  isEncryptionAvailable(): boolean { return this.available }
  encryptString(value: string): Buffer { return Buffer.from(`encrypted:${value}`, 'utf8') }
  decryptString(value: Buffer): string {
    if (this.failDecrypt) throw new Error('cannot decrypt')
    const decoded = value.toString('utf8')
    if (!decoded.startsWith('encrypted:')) throw new Error('invalid ciphertext')
    return decoded.slice('encrypted:'.length)
  }
}

describe('settings persistence', () => {
  let userDataRoot: string
  let encryption: TestSafeStorage
  let store: SettingsStore

  beforeEach(async () => {
    userDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-settings-'))
    encryption = new TestSafeStorage()
    store = new SettingsStore(() => userDataRoot, encryption)
  })

  afterEach(async () => fs.rm(userDataRoot, { recursive: true, force: true }))

  it('encrypts secrets and keeps the MCP URL identity stable until explicit reset', async () => {
    await store.initialize()
    const initial = store.getMcpSettings()
    const configured = await store.saveMcpSettings({ ...initial, port: 24567 })
    const toggled = await store.saveMcpSettings({ ...configured, enabled: true })
    expect(toggled.token).toBe(initial.token)

    const settingsFile = path.join(userDataRoot, 'data', 'settings.json')
    const onDisk = await fs.readFile(settingsFile, 'utf8')
    expect(onDisk).not.toContain(initial.token)
    expect(onDisk).toContain('tokenEncrypted')

    const restarted = new SettingsStore(() => userDataRoot, encryption)
    await restarted.initialize()
    expect(restarted.getMcpSettings()).toEqual(toggled)

    const reset = await restarted.saveMcpSettings({
      ...toggled, token: restarted.createMcpToken(),
    })
    expect(reset.token).not.toBe(initial.token)
  })

  it('migrates plaintext settings once and preserves unknown top-level fields', async () => {
    const settingsFile = path.join(userDataRoot, 'data', 'settings.json')
    await fs.mkdir(path.dirname(settingsFile), { recursive: true })
    await fs.writeFile(settingsFile, JSON.stringify({
      general: { editorFont: 'xiaolai' },
      ai: { apiKey: 'plain-api-key' },
      mcp: { enabled: true, port: 24567, token: 't'.repeat(43) },
      futureOption: { retained: true },
    }))

    await store.initialize()
    expect(store.getAISettings().apiKey).toBe('plain-api-key')
    expect(store.getGeneralSettings()).toEqual({ editorFont: 'xiaolai' })
    const persisted = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    expect(persisted.schemaVersion).toBe(1)
    expect(persisted.futureOption).toEqual({ retained: true })
    expect(JSON.stringify(persisted)).not.toContain('plain-api-key')
    expect(JSON.stringify(persisted)).not.toContain('"token":"')
  })

  it('does not overwrite malformed or unsupported settings', async () => {
    const settingsFile = path.join(userDataRoot, 'data', 'settings.json')
    await fs.mkdir(path.dirname(settingsFile), { recursive: true })
    await fs.writeFile(settingsFile, '{broken')
    await expect(store.initialize()).rejects.toMatchObject({ code: 'MALFORMED' })
    expect(await fs.readFile(settingsFile, 'utf8')).toBe('{broken')

    await fs.writeFile(settingsFile, JSON.stringify({ schemaVersion: 99 }))
    await expect(store.initialize()).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' })
  })

  it('surfaces unavailable encryption and decryption failure with typed errors', async () => {
    encryption.available = false
    await expect(store.initialize()).rejects.toEqual(
      expect.objectContaining<Partial<SettingsStoreError>>({ code: 'ENCRYPTION_UNAVAILABLE' }),
    )

    encryption.available = true
    await store.initialize()
    encryption.failDecrypt = true
    const restarted = new SettingsStore(() => userDataRoot, encryption)
    await expect(restarted.initialize()).rejects.toMatchObject({ code: 'UNDECRYPTABLE' })
  })

  it('persists and validates the global editor font', async () => {
    await store.initialize()
    expect(store.getGeneralSettings()).toEqual({ editorFont: 'system' })
    expect(await store.saveGeneralSettings({ editorFont: 'xiaolai' }))
      .toEqual({ editorFont: 'xiaolai' })
    expect(await store.saveGeneralSettings({ editorFont: 'invalid' as never }))
      .toEqual({ editorFont: 'system' })
  })

  it('preserves the last committed settings when atomic rename fails', async () => {
    await store.initialize()
    const settingsFile = path.join(userDataRoot, 'data', 'settings.json')
    const before = await fs.readFile(settingsFile, 'utf8')
    const failingFs = new Proxy(fs, {
      get(target, property, receiver) {
        if (property === 'rename') return async () => { throw new Error('injected rename failure') }
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const failingStore = new SettingsStore(() => userDataRoot, encryption, failingFs)
    await failingStore.initialize()
    await expect(failingStore.saveGeneralSettings({ editorFont: 'xiaolai' }))
      .rejects.toMatchObject({ code: 'PERSISTENCE_ERROR' })
    expect(await fs.readFile(settingsFile, 'utf8')).toBe(before)
    expect((await fs.readdir(path.dirname(settingsFile))).filter((name) => name.endsWith('.tmp')))
      .toEqual([])
  })
})
