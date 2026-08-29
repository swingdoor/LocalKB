import { Editor } from '@tiptap/core'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { CanvasReference } from '../extensions/ResourceReferences'
import { StableNodeId } from '../extensions/StableNodeId'
import {
  convertTextRootBlock,
  createRootBlockTarget,
  deleteRootBlock,
  duplicateRootBlock,
  insertParagraphAroundTarget,
  resolveRootBlockTarget,
  setAllTaskItems,
  unwrapDetailsRootBlock,
  updateRootBlockAttrs,
} from './blockCommands'

function createEditor(content: Record<string, unknown>) {
  return new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Details.configure({ persist: false }),
      DetailsSummary,
      DetailsContent,
      CanvasReference,
      StableNodeId,
    ],
    content,
  })
}

describe('root block commands', () => {
  it('inserts around, duplicates with fresh stable IDs, and deletes a complete subtree', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'blockquote',
        attrs: { nodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        content: [{
          type: 'paragraph',
          attrs: { nodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
          content: [{ type: 'text', text: 'quoted' }],
        }],
      }],
    })
    const target = createRootBlockTarget(editor.state.doc.child(0), 0)!

    expect(insertParagraphAroundTarget(editor, target, 'before')).toBe(true)
    const movedTarget = createRootBlockTarget(editor.state.doc.child(1), editor.state.doc.child(0).nodeSize)!
    expect(duplicateRootBlock(editor, movedTarget)).toBe(true)
    const json = editor.getJSON() as any
    expect(json.content?.map((node: any) => node.type)).toEqual(['paragraph', 'blockquote', 'blockquote', 'paragraph'])
    expect(json.content?.[1].content?.[0].content?.[0].text).toBe('quoted')
    expect(json.content?.[2].attrs?.nodeId).not.toBe(json.content?.[1].attrs?.nodeId)
    expect(json.content?.[2].content?.[0].attrs?.nodeId).not.toBe(json.content?.[1].content?.[0].attrs?.nodeId)

    const recapturedTarget = createRootBlockTarget(editor.state.doc.child(1), editor.state.doc.child(0).nodeSize)!
    expect(deleteRootBlock(editor, recapturedTarget)).toBe(true)
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'blockquote', 'paragraph'])
    editor.destroy()
  })

  it('guards stale targets and unsupported resource conversions', () => {
    const editor = createEditor({
      type: 'doc', content: [{ type: 'canvasReference', attrs: { canvasId: 'canvas' } }],
    })
    const target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    const stale = { ...target, nodeId: 'different' }
    expect(resolveRootBlockTarget(editor, stale)).toBeNull()
    expect(updateRootBlockAttrs(editor, stale, { textAlign: 'center' })).toBe(false)
    expect(convertTextRootBlock(editor, target, 'paragraph')).toBe(false)
    expect(editor.getJSON().content?.[0].type).toBe('canvasReference')
    editor.destroy()
  })

  it('uses official schema-aware commands for headings and lists', () => {
    const editor = createEditor({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
    })
    let target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'heading', 3)).toBe(true)
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })

    target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'bulletList')).toBe(true)
    expect(editor.getJSON().content?.[0].type).toBe('bulletList')
    editor.destroy()
  })

  it('switches list types and unwraps lists, blockquotes, and code blocks without nesting wrappers', () => {
    const editor = createEditor({
      type: 'doc', content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
        }],
      }],
    })
    let target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'orderedList')).toBe(true)
    expect(editor.getJSON().content?.[0].type).toBe('orderedList')
    expect(JSON.stringify(editor.getJSON().content?.[0])).not.toContain('bulletList')

    target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'taskList')).toBe(true)
    expect(editor.getJSON().content?.[0].type).toBe('taskList')
    expect(JSON.stringify(editor.getJSON().content?.[0])).not.toContain('orderedList')

    target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'paragraph')).toBe(true)
    expect(editor.getJSON().content?.every((node) => node.type === 'paragraph')).toBe(true)

    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }] }],
    })
    target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'paragraph')).toBe(true)
    expect(editor.getJSON().content?.every((node) => node.type === 'paragraph')).toBe(true)

    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'code' }] }],
    })
    target = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(convertTextRootBlock(editor, target, 'paragraph')).toBe(true)
    expect(editor.getJSON().content?.every((node) => node.type === 'paragraph')).toBe(true)
    editor.destroy()
  })

  it('updates every task item and unwraps Details into normal blocks', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
        ] },
        { type: 'details', content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] },
        ] },
      ],
    })
    const taskTarget = createRootBlockTarget(editor.state.doc.child(0), 0)!
    expect(setAllTaskItems(editor, taskTarget, true)).toBe(true)
    expect((editor.getJSON() as any).content?.[0].content?.every((item: any) => item.attrs?.checked === true)).toBe(true)

    const detailsPos = editor.state.doc.child(0).nodeSize
    const detailsTarget = createRootBlockTarget(editor.state.doc.child(1), detailsPos)!
    expect(unwrapDetailsRootBlock(editor, detailsTarget)).toBe(true)
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['taskList', 'paragraph', 'paragraph', 'paragraph'])
    expect((editor.getJSON() as any).content?.[1].content?.[0].text).toBe('Summary')
    expect((editor.getJSON() as any).content?.[2].content?.[0].text).toBe('Body')
    editor.destroy()
  })
})
