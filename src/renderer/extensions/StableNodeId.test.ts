import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { StableNodeId } from './StableNodeId'

describe('StableNodeId', () => {
  it('assigns stable unique IDs to newly inserted and pasted nodes', () => {
    const existingId = '11111111-1111-4111-8111-111111111111'
    const editor = new Editor({
      extensions: [StarterKit, StableNodeId],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { nodeId: existingId } }],
      },
    })

    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { nodeId: existingId } },
        {
          type: 'paragraph', attrs: { nodeId: existingId },
          content: [{ type: 'text', text: '粘贴内容' }],
        },
      ],
    })
    const ids: string[] = []
    editor.state.doc.descendants((node) => {
      if (!node.isText) ids.push(node.attrs.nodeId)
    })

    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(existingId)
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set(ids).size).toBe(2)
    editor.destroy()
  })
})
