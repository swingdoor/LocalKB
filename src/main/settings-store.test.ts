import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userDataRoot = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

import { settingsStore } from './settings-store'

describe('settings persistence', () => {
  beforeEach(async () => {
    userDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'localkb-settings-'))
  })

  afterEach(async () => fs.rm(userDataRoot, { recursive: true, force: true }))

  it('keeps the token across reads, toggles, and simulated restarts until explicit reset', async () => {
    const initial = settingsStore.getMcpSettings()
    const settingsFile = path.join(userDataRoot, 'data', 'settings.json')
    expect(JSON.parse(await fs.readFile(settingsFile, 'utf8')).mcp.token).toBe(initial.token)

    const configured = settingsStore.saveMcpSettings({ ...initial, port: 24567 })
    const toggled = settingsStore.saveMcpSettings({ ...configured, enabled: true })
    expect(toggled.token).toBe(initial.token)
    expect(settingsStore.getMcpSettings()).toMatchObject({ port: 24567, token: initial.token })

    const reset = settingsStore.saveMcpSettings({
      ...toggled, token: settingsStore.createMcpToken(),
    })
    expect(reset.token).not.toBe(initial.token)
    expect(settingsStore.getMcpSettings()).toMatchObject({ port: 24567, token: reset.token })
  })

  it('persists and validates the global editor font', () => {
    expect(settingsStore.getGeneralSettings()).toEqual({ editorFont: 'system' })

    expect(settingsStore.saveGeneralSettings({ editorFont: 'xiaolai' }))
      .toEqual({ editorFont: 'xiaolai' })
    expect(settingsStore.getGeneralSettings()).toEqual({ editorFont: 'xiaolai' })

    expect(settingsStore.saveGeneralSettings({ editorFont: 'invalid' as never }))
      .toEqual({ editorFont: 'system' })
  })
})
