import { describe, expect, it, vi } from 'vitest'
import { saveGeneralSettingsAndSyncWindow } from './general-settings-window-sync'

describe('General Settings native-window synchronization', () => {
  it('persists first, applies the canonical returned theme, then returns it', async () => {
    const events: string[] = []
    const window = {
      setBackgroundColor: vi.fn(() => { events.push('background') }),
      setTitleBarOverlay: vi.fn(() => { events.push('overlay') }),
    }
    const persist = vi.fn(async () => {
      events.push('persist')
      return { editorFont: 'system' as const, applicationTheme: 'night' as const }
    })

    const saved = await saveGeneralSettingsAndSyncWindow(
      window as never,
      { applicationTheme: 'paper' },
      persist,
      'win32',
    )

    expect(saved.applicationTheme).toBe('night')
    expect(events).toEqual(['persist', 'background', 'overlay'])
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#18181B')
  })

  it('leaves the native window untouched when persistence fails', async () => {
    const window = { setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() }
    const persist = vi.fn(async () => { throw new Error('保存失败') })

    await expect(saveGeneralSettingsAndSyncWindow(
      window as never,
      { applicationTheme: 'night' },
      persist,
      'win32',
    )).rejects.toThrow('保存失败')
    expect(window.setBackgroundColor).not.toHaveBeenCalled()
    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })
})
