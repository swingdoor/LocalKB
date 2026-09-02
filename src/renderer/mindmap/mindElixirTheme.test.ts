import { describe, expect, it } from 'vitest'
import {
  JIJIAN_MIND_MAP_EXPORT_THEME,
  JIJIAN_MIND_MAP_SCREEN_THEMES,
  MIND_MAP_EXPORT_CSS,
} from './mindElixirTheme'

describe('Jijian mind map theme', () => {
  it('provides matching classic, paper, and night screen themes', () => {
    expect(Object.keys(JIJIAN_MIND_MAP_SCREEN_THEMES)).toEqual(['classic', 'paper', 'night'])
    expect(JIJIAN_MIND_MAP_SCREEN_THEMES.classic.type).toBe('light')
    expect(JIJIAN_MIND_MAP_SCREEN_THEMES.paper.type).toBe('light')
    expect(JIJIAN_MIND_MAP_SCREEN_THEMES.night.type).toBe('dark')
    expect(JIJIAN_MIND_MAP_SCREEN_THEMES.classic.cssVar?.['--bgcolor']).toBe('#ffffff')
    expect(JIJIAN_MIND_MAP_SCREEN_THEMES.paper.cssVar?.['--bgcolor']).toBe('#faf7f2')
    expect(JIJIAN_MIND_MAP_SCREEN_THEMES.night.cssVar?.['--bgcolor']).toBe('#18181b')
    for (const theme of Object.values(JIJIAN_MIND_MAP_SCREEN_THEMES)) {
      expect(theme.cssVar?.['--selected']).toBeTruthy()
      expect(theme.palette.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('keeps export rendering on the fixed classic light theme', () => {
    expect(JIJIAN_MIND_MAP_EXPORT_THEME).toBe(JIJIAN_MIND_MAP_SCREEN_THEMES.classic)
    expect(MIND_MAP_EXPORT_CSS).toContain('background:#fff')
    expect(MIND_MAP_EXPORT_CSS).toContain('font-family')
    expect(MIND_MAP_EXPORT_CSS).toContain('font-size:24px')
    expect(MIND_MAP_EXPORT_CSS).toContain('me-children me-children me-tpc')
    expect(MIND_MAP_EXPORT_CSS).toContain('me-tpc>.tags')
    expect(MIND_MAP_EXPORT_CSS).toContain('me-parent:has(>me-tpc>.tags){padding-bottom:32px}')
    expect(MIND_MAP_EXPORT_CSS).toContain('.rhs me-tpc>.tags{right:0;left:auto}')
  })
})
