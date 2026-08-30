import { describe, expect, it } from 'vitest'
import {
  appendStableSuffix,
  createMarkdownFrontmatter,
  encodeMarkdownRelativePath,
  extensionForMimeType,
  isSafeRelativeResourcePath,
  sanitizeExportFileName,
} from './markdown-export-utils'

describe('markdown export path utilities', () => {
  it('creates portable names and deterministic collision suffixes', () => {
    expect(sanitizeExportFileName(' 报告:最终版?.pdf ')).toBe('报告_最终版_.pdf')
    expect(sanitizeExportFileName('CON')).toBe('resource')
    expect(appendStableSuffix('报告.pdf', '12345678-abcd')).toBe('报告-12345678.pdf')
    expect(extensionForMimeType('IMAGE/PNG')).toBe('png')
  })

  it('encodes POSIX Markdown links and rejects unsafe paths', () => {
    expect(encodeMarkdownRelativePath('笔记.assets/images/图 1.png')).toBe(
      '<./笔记.assets/images/图 1.png>',
    )
    expect(encodeMarkdownRelativePath('笔记 #1.assets/images/100%.png')).toBe(
      '<./笔记 %231.assets/images/100%25.png>',
    )
    expect(isSafeRelativeResourcePath('note.assets/images/a.png')).toBe(true)
    expect(isSafeRelativeResourcePath('../a.png')).toBe(false)
    expect(isSafeRelativeResourcePath('C:\\temp\\a.png')).toBe(false)
    expect(isSafeRelativeResourcePath('/tmp/a.png')).toBe(false)
  })

  it('serializes quoted YAML values and ISO timestamps without an H1', () => {
    const output = createMarkdownFrontmatter({
      title: '标题: "特殊"',
      createdAt: '2026-08-30T01:02:03+08:00',
      updatedAt: '2026-08-30T04:05:06+08:00',
    })
    expect(output).toContain('title: "标题: \\"特殊\\""')
    expect(output).toContain('created: "2026-08-29T17:02:03.000Z"')
    expect(output).not.toContain('# 标题')
  })
})
