import { describe, expect, it } from 'vitest'
import { buildPdfHtml } from './pdf-export'

describe('PDF export document', () => {
  it('escapes the title and constrains static resource frames in print layout', () => {
    const html = buildPdfHtml('<测试>', '<div data-pdf-resource-frame><svg></svg></div>')

    expect(html).toContain('<h1>&lt;测试&gt;</h1>')
    expect(html).toContain('[data-pdf-resource-frame] > svg')
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('table-layout: fixed')
  })
})
