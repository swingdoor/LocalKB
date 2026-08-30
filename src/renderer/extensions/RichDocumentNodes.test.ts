import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { describe, expect, it } from 'vitest'
import type { TipTapDocument } from '@shared/knowledge-types'
import { assertTipTapDocument } from '@shared/knowledge-validation'
import { StableNodeId } from './StableNodeId'
import { DocumentReferenceNode, FileAttachmentNode } from './RichDocumentNodes'

describe('rich document Tiptap extensions', () => {
  it('round-trips references, attachments, details, underline and highlight', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Highlight.configure({ multicolor: true }),
        Details.configure({ persist: false }), DetailsSummary, DetailsContent,
        DocumentReferenceNode, FileAttachmentNode, StableNodeId,
      ],
      content: {
        type: 'doc', content: [
          { type: 'paragraph', content: [
            { type: 'text', text: 'marked', marks: [
              { type: 'underline' }, { type: 'highlight', attrs: { color: '#FEF08A' } },
            ] },
            { type: 'documentReference', attrs: {
              documentId: '11111111-1111-4111-8111-111111111111', label: 'Target',
            } },
          ] },
          { type: 'fileAttachment', attrs: {
            assetId: '22222222-2222-4222-8222-222222222222', displayName: 'notes.txt',
          } },
          { type: 'details', content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph' }] },
          ] },
        ],
      },
    })

    editor.chain().focus('end').insertContent(' ').run()
    const json = editor.getJSON() as TipTapDocument
    expect(() => assertTipTapDocument(json)).not.toThrow()
    expect(json.content?.every((node) => typeof node.attrs?.nodeId === 'string')).toBe(true)
    expect(JSON.stringify(json)).toContain('"type":"underline"')
    expect(JSON.stringify(json)).toContain('"type":"highlight"')
    expect(editor.schema.nodes.inlineMath).toBeUndefined()
    expect(editor.schema.nodes.fileAttachment.spec.atom).toBe(true)
    expect(editor.schema.nodes.details.spec.content).toBe('detailsSummary detailsContent')
    expect(editor.getHTML()).toContain('data-document-id="11111111-1111-4111-8111-111111111111"')
    expect(editor.getHTML()).toContain('data-display-name="notes.txt"')
    editor.destroy()
  })
})
