import { describe, expect, it, vi } from 'vitest'
import { applyWindowAppearance, getWindowAppearance } from './window-appearance'

describe('native window theme appearance', () => {
  it.each([
    ['classic', '#FFFFFF', '#333333'],
    ['paper', '#FBF8F3', '#3F3831'],
    ['night', '#18181B', '#FAFAFA'],
  ] as const)('provides canonical %s colors', (theme, background, symbol) => {
    expect(getWindowAppearance(theme)).toEqual({
      backgroundColor: background,
      titleBarOverlay: { color: background, symbolColor: symbol, height: 36 },
    })
  })

  it('updates the Windows overlay without recreating the window', () => {
    const window = { setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() }
    applyWindowAppearance(window as never, 'night', 'win32')
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#18181B')
    expect(window.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#18181B', symbolColor: '#FAFAFA', height: 36,
    })
  })

  it('preserves macOS-owned title-bar controls', () => {
    const window = { setBackgroundColor: vi.fn(), setTitleBarOverlay: vi.fn() }
    applyWindowAppearance(window as never, 'paper', 'darwin')
    expect(window.setBackgroundColor).toHaveBeenCalledWith('#FBF8F3')
    expect(window.setTitleBarOverlay).not.toHaveBeenCalled()
  })
})
