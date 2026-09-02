import { describe, expect, it } from 'vitest'
import { getResourceScreenTheme, preserveExcalidrawContentTheme } from './resource-screen-theme'

describe('resource screen theme boundary', () => {
  it.each([
    ['classic', 'light'],
    ['paper', 'light'],
    ['night', 'dark'],
  ] as const)('maps %s to the supported Excalidraw %s appearance', (theme, appearance) => {
    expect(getResourceScreenTheme(theme)).toMatchObject({ id: theme, excalidrawAppearance: appearance })
  })

  it('normalizes unknown application themes to classic', () => {
    expect(getResourceScreenTheme('warm')).toMatchObject({ id: 'classic', excalidrawAppearance: 'light' })
  })

  it('removes a screen-only Excalidraw theme when the scene did not persist one', () => {
    expect(preserveExcalidrawContentTheme({ theme: 'dark', viewBackgroundColor: '#fff' }, {})).toEqual({
      viewBackgroundColor: '#fff',
    })
  })

  it('restores the scene-owned Excalidraw theme instead of persisting the application appearance', () => {
    expect(preserveExcalidrawContentTheme(
      { theme: 'dark', viewBackgroundColor: '#fff' },
      { theme: 'light' },
    )).toEqual({ theme: 'light', viewBackgroundColor: '#fff' })
  })
})
