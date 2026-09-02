import { describe, expect, it } from 'vitest'
import {
  APPLICATION_THEMES,
  getApplicationTheme,
  isApplicationTheme,
  normalizeApplicationTheme,
} from './application-themes'

describe('application theme contract', () => {
  it('exposes exactly the three stable themes and appearances', () => {
    expect(APPLICATION_THEMES.map((theme) => theme.id)).toEqual(['classic', 'paper', 'night'])
    expect(APPLICATION_THEMES.map((theme) => theme.appearance)).toEqual(['light', 'light', 'dark'])
    expect(APPLICATION_THEMES.every((theme) => theme.window.background && theme.window.symbol)).toBe(true)
  })

  it.each(['classic', 'paper', 'night'])('accepts %s', (theme) => {
    expect(isApplicationTheme(theme)).toBe(true)
    expect(normalizeApplicationTheme(theme)).toBe(theme)
  })

  it.each([undefined, null, '', 'white', 'warm', 'green', 'future'])('falls back from %s to classic', (theme) => {
    expect(normalizeApplicationTheme(theme)).toBe('classic')
    expect(getApplicationTheme(theme).id).toBe('classic')
  })
})
