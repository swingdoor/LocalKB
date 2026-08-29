import { Schema } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import {
  NON_ROOT_NODE_TYPES,
  ROOT_BLOCK_NODE_TYPES,
  SLASH_COMMAND_BY_ID,
  findRootBlockAtPosition,
  isRootBlockNodeType,
} from './nodeCatalog'

describe('editor node catalog', () => {
  it('maps every slash command to its resulting Tiptap node type', () => {
    expect(SLASH_COMMAND_BY_ID.get('h1')?.resultNodeTypes).toEqual(['heading'])
    expect(SLASH_COMMAND_BY_ID.get('bullet')?.resultNodeTypes).toEqual(['bulletList'])
    expect(SLASH_COMMAND_BY_ID.get('table')?.resultNodeTypes).toEqual(['table'])
    expect(SLASH_COMMAND_BY_ID.get('image')?.resultNodeTypes).toEqual(['assetImage', 'image'])
    expect(SLASH_COMMAND_BY_ID.get('canvas')?.resultNodeTypes).toEqual(['canvasReference'])
    expect(SLASH_COMMAND_BY_ID.get('mindmap')?.resultNodeTypes).toEqual(['mindmapReference'])
  })

  it('keeps documentReference as the inline exception', () => {
    expect(SLASH_COMMAND_BY_ID.get('documentReference')).toMatchObject({
      resultNodeTypes: ['documentReference'],
      scope: 'inline',
    })
    expect(isRootBlockNodeType('documentReference')).toBe(false)
  })

  it('covers all supported root blocks and rejects internal nodes', () => {
    expect(ROOT_BLOCK_NODE_TYPES).toEqual(expect.arrayContaining([
      'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList',
      'codeBlock', 'table', 'horizontalRule', 'details', 'image', 'assetImage',
      'fileAttachment', 'canvasReference', 'mindmapReference',
    ]))
    for (const nodeType of NON_ROOT_NODE_TYPES) expect(isRootBlockNodeType(nodeType)).toBe(false)
  })

  it('uses the actual doc child position instead of the block group alone', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'inline*' },
        blockquote: { group: 'block', content: 'block+' },
        text: { group: 'inline' },
      },
    })
    const nestedParagraph = schema.node('paragraph', null, [schema.text('nested')])
    const quote = schema.node('blockquote', null, [nestedParagraph])
    const topParagraph = schema.node('paragraph', null, [schema.text('top')])
    const doc = schema.node('doc', null, [quote, topParagraph])

    expect(findRootBlockAtPosition(doc, 1)?.node.type.name).toBe('blockquote')
    expect(findRootBlockAtPosition(doc, 2)?.node.type.name).toBe('blockquote')
    expect(findRootBlockAtPosition(doc, quote.nodeSize)?.node.type.name).toBe('paragraph')
  })
})
