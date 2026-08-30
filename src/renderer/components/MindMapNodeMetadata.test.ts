import { describe, expect, it } from 'vitest'
import { parseMindMapTags } from './MindMapNodeMetadata'

describe('parseMindMapTags', () => {
  it('accepts Chinese and western separators without producing invalid tags', () => {
    expect(parseMindMapTags('重点，待办, 架构；设计、重点')).toEqual(['重点', '待办', '架构', '设计'])
  })
})
