import { describe, expect, it } from 'vitest'
import { TIPTAP_MARK_TYPES, TIPTAP_NODE_TYPES, type TipTapNode } from './knowledge-types'
import { createFullDocumentFixture } from '../renderer/markdown/fullDocument.fixture'
import {
  assertMarkdownExportDocument,
  MARKDOWN_EXPORT_SUPPORTED_NODE_TYPES,
} from './markdown-export-validation'

describe('markdown export document validation', () => {
  it('keeps the export contract exhaustive with the native node catalog', () => {
    const nodes = new Set<string>()
    const marks = new Set<string>()
    const visit = (node: TipTapNode) => {
      nodes.add(node.type)
      node.marks?.forEach((mark) => marks.add(mark.type))
      node.content?.forEach(visit)
    }
    visit(createFullDocumentFixture())
    expect([...MARKDOWN_EXPORT_SUPPORTED_NODE_TYPES]).toEqual([...TIPTAP_NODE_TYPES])
    expect([...nodes].sort()).toEqual([...TIPTAP_NODE_TYPES].sort())
    expect([...marks].sort()).toEqual([...TIPTAP_MARK_TYPES].sort())
    expect(() => assertMarkdownExportDocument(createFullDocumentFixture())).not.toThrow()
  })

  it('rejects resource nodes without a stable node id', () => {
    const document = createFullDocumentFixture()
    const canvas = document.content?.find((node) => node.type === 'canvasReference')
    if (canvas?.attrs) delete canvas.attrs.nodeId
    expect(() => assertMarkdownExportDocument(document)).toThrow('attrs.nodeId')
  })

  it('rejects unknown nodes instead of silently dropping them', () => {
    const document = createFullDocumentFixture() as any
    document.content.push({ type: 'unknownExportNode', attrs: { nodeId: '00000000-0000-4000-8000-000000000999' } })
    expect(() => assertMarkdownExportDocument(document)).toThrow('类型不受支持')
  })
})
