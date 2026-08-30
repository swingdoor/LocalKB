import { describe, expect, it } from 'vitest'
import { JIJIAN_MIND_MAP_THEME, MIND_MAP_EXPORT_CSS } from './mindElixirTheme'

describe('Jijian mind map theme', () => {
  it('provides one concrete light theme for editor, preview, PNG, and SVG rendering', () => {
    expect(JIJIAN_MIND_MAP_THEME.type).toBe('light')
    expect(JIJIAN_MIND_MAP_THEME.cssVar?.['--bgcolor']).toBe('#ffffff')
    expect(JIJIAN_MIND_MAP_THEME.cssVar?.['--selected']).toBeTruthy()
    expect(JIJIAN_MIND_MAP_THEME.palette.length).toBeGreaterThanOrEqual(6)
    expect(MIND_MAP_EXPORT_CSS).toContain('background:#fff')
    expect(MIND_MAP_EXPORT_CSS).toContain('font-family')
    expect(MIND_MAP_EXPORT_CSS).toContain('font-size:24px')
    expect(MIND_MAP_EXPORT_CSS).toContain('me-children me-children me-tpc')
    expect(MIND_MAP_EXPORT_CSS).toContain('me-tpc>.tags')
    expect(MIND_MAP_EXPORT_CSS).toContain('me-parent:has(>me-tpc>.tags){padding-bottom:32px}')
    expect(MIND_MAP_EXPORT_CSS).toContain('.rhs me-tpc>.tags{right:0;left:auto}')
  })
})
