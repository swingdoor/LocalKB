import { describe, expect, it } from 'vitest'
import {
  createNodeBackground, createNodeBorder, nodeBackgroundColor,
  nodeBackgroundPattern, nodeBorderColor, nodeBorderStyle,
} from './mindMapNodeStyle'

describe('mind map node presentation helpers', () => {
  it('combines border color and style into the native border field', () => {
    expect(createNodeBorder(undefined, 'solid')).toBeUndefined()
    expect(createNodeBorder('#2563eb', 'dashed')).toBe('1px dashed #2563eb')
    expect(nodeBorderStyle('1px dotted #dc2626')).toBe('dotted')
    expect(nodeBorderColor('1px dotted #DC2626')).toBe('#dc2626')
  })

  it('uses native CSS background strings for the three supported patterns', () => {
    expect(createNodeBackground(undefined, 'solid')).toBeUndefined()
    const diagonal = createNodeBackground('#eff6ff', 'diagonal')!
    const lines = createNodeBackground('#f0fdf4', 'lines')!
    expect(nodeBackgroundPattern(diagonal)).toBe('diagonal')
    expect(nodeBackgroundPattern(lines)).toBe('lines')
    expect(nodeBackgroundColor(diagonal)).toBe('#eff6ff')
    expect(nodeBackgroundColor(lines)).toBe('#f0fdf4')
    expect(nodeBackgroundPattern('radial-gradient(circle, black 1px, transparent 1px), #ffffff')).toBe('solid')
  })
})
