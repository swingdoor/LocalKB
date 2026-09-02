import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/renderer/styles/index.css'), 'utf8')
const themes = ['classic', 'paper', 'night'] as const
const requiredTokens = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted',
  'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
  'border', 'input', 'ring', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
  'bg-editor', 'resource-canvas-surface', 'resource-mindmap-surface',
  'editor-text', 'editor-muted', 'editor-heading-4', 'editor-heading-5',
  'editor-heading-6', 'editor-subtle', 'interaction-color', 'interaction-foreground', 'interaction-hover',
  'interaction-soft', 'primary-color', 'success-color', 'error-color', 'overlay-bg',
  'code-bg', 'code-inline-bg', 'code-header-bg', 'code-border', 'code-text', 'code-comment', 'code-keyword',
  'code-string', 'code-variable', 'code-function', 'code-type', 'code-builtin', 'code-number',
  'code-attr', 'code-tag', 'code-addition', 'code-deletion', 'code-params',
] as const

function themeTokens(theme: typeof themes[number]): Map<string, string> {
  const selector = `:root[data-theme="${theme}"]`
  const selectorIndex = css.indexOf(selector)
  expect(selectorIndex).toBeGreaterThan(-1)
  const open = css.indexOf('{', selectorIndex)
  const close = css.indexOf('\n  }', open)
  const entries = [...css.slice(open + 1, close).matchAll(/--([\w-]+):\s*([^;]+);/g)]
  return new Map(entries.map((match) => [match[1], match[2].trim()]))
}

function luminance(hsl: string): number {
  const match = hsl.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!match) throw new Error(`Expected HSL triplet, received ${hsl}`)
  const h = Number(match[1]) / 360
  const s = Number(match[2]) / 100
  const l = Number(match[3]) / 100
  const hue = (p: number, q: number, t: number) => {
    const normalized = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (normalized < 1 / 6) return p + (q - p) * 6 * normalized
    if (normalized < 1 / 2) return q
    if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const rgb = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
  const linear = rgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('application theme token contract', () => {
  it.each(themes)('%s defines every approved semantic token', (theme) => {
    const tokens = themeTokens(theme)
    expect(requiredTokens.filter((token) => !tokens.has(token))).toEqual([])
  })

  it.each(themes)('%s keeps core surfaces and states readable', (theme) => {
    const tokens = themeTokens(theme)
    const value = (name: string) => tokens.get(name)!
    expect(contrast(value('foreground'), value('background'))).toBeGreaterThanOrEqual(7)
    expect(contrast(value('muted-foreground'), value('background'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value('primary-foreground'), value('primary'))).toBeGreaterThanOrEqual(7)
    expect(contrast(value('destructive-foreground'), value('destructive'))).toBeGreaterThanOrEqual(3)
    expect(contrast(value('accent-foreground'), value('accent'))).toBeGreaterThanOrEqual(7)
    expect(contrast(value('popover-foreground'), value('popover'))).toBeGreaterThanOrEqual(7)
    expect(contrast(value('sidebar-foreground'), value('sidebar'))).toBeGreaterThanOrEqual(7)
    expect(contrast(value('ring'), value('background'))).toBeGreaterThanOrEqual(3)
    expect(contrast(value('border'), value('background'))).toBeGreaterThanOrEqual(1.2)
  })

  it('keeps radius, fonts, and spacing outside named theme selectors', () => {
    for (const theme of themes) {
      const tokens = themeTokens(theme)
      expect(tokens.has('radius')).toBe(false)
      expect(tokens.has('editor-font-family')).toBe(false)
      expect(tokens.has('editor-letter-spacing')).toBe(false)
    }
  })
})
