import { afterEach, describe, expect, it } from 'vitest'
import { applyApplicationTheme } from './theme'

describe('renderer theme application', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  it.each([
    ['classic', false],
    ['paper', false],
    ['night', true],
  ] as const)('applies %s and its dark appearance', (theme, dark) => {
    expect(applyApplicationTheme(theme)).toBe(theme)
    expect(document.documentElement.dataset.theme).toBe(theme)
    expect(document.documentElement.classList.contains('dark')).toBe(dark)
  })

  it('normalizes unknown values and removes a stale dark class', () => {
    document.documentElement.classList.add('dark')
    expect(applyApplicationTheme('warm')).toBe('classic')
    expect(document.documentElement.dataset.theme).toBe('classic')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
