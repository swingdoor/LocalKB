import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { FontFamily } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Markdown } from '@tiptap/markdown'
import { describe, expect, it } from 'vitest'
import FontSize from '../extensions/FontSize'
import Color from '../extensions/Color'
import ResizableImage from '../extensions/ResizableImage'
import { StableNodeId } from '../extensions/StableNodeId'
import { AssetImage, CanvasReference, MindMapReference } from '../extensions/ResourceReferences'
import { DocumentReferenceNode, FileAttachmentNode } from '../extensions/RichDocumentNodes'
import type { MarkdownExportManifest } from '@shared/markdown-export-types'
import { hashString } from '@shared/markdown-export-utils'
import { collectMarkdownExportResources } from './markdownExportPlan'
import {
  MarkdownDetails,
  MarkdownDetailsContent,
  MarkdownDetailsSummary,
  MarkdownTable,
  MarkdownTextStyle,
} from './markdownExtensions'
import { serializeDocumentMarkdown } from './markdownSerializer'
import { createFullDocumentFixture } from './fullDocument.fixture'

function createTestEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link,
      TaskList,
      TaskItem.configure({ nested: true }),
      MarkdownTable,
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      MarkdownTextStyle,
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize.configure({ types: ['textStyle'] }),
      Color.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      MarkdownDetails,
      MarkdownDetailsSummary,
      MarkdownDetailsContent,
      CanvasReference,
      MindMapReference,
      AssetImage,
      DocumentReferenceNode,
      FileAttachmentNode,
      StableNodeId,
      Markdown,
    ],
  })
}

function manifestForFixture(): MarkdownExportManifest {
  const plan = collectMarkdownExportResources(createFullDocumentFixture())
  return {
    assetDirectoryName: '完整导出示例.assets',
    nodeResources: plan.nodeResources,
    resources: Object.fromEntries(plan.resources.map((resource) => [resource.resourceKey, {
      ...resource,
      status: 'ready' as const,
      displayName: resource.label,
      ...(resource.kind === 'documentReference'
        ? {}
        : { relativePath: `完整导出示例.assets/${resource.kind}/${resource.resourceKey}.png` }),
    }])),
  }
}

describe('serializeDocumentMarkdown', () => {
  it('serializes the complete fixture directly from JSON without silent node loss', () => {
    const editor = createTestEditor()
    const markdown = serializeDocumentMarkdown(editor, createFullDocumentFixture(), {
      vaultId: 'vault',
      documentId: 'document',
      title: '完整导出示例',
      createdAt: '2026-08-30T01:02:03.000Z',
      updatedAt: '2026-08-30T04:05:06.000Z',
    }, manifestForFixture())
    editor.destroy()

    expect(markdown).toContain('title: "完整导出示例"')
    expect(markdown.match(/^# 完整导出示例$/gm)).toHaveLength(1)
    expect(markdown).toContain('**粗体**')
    expect(markdown).toContain('++下划线++')
    expect(markdown).toContain('==高亮==')
    expect(markdown).toContain('样式文本')
    expect(markdown).toContain('- [x] 已完成任务')
    expect(markdown).toContain('```typescript')
    expect(markdown).toContain('| 列 A | 列 B |')
    expect(markdown).toContain('<details>')
    expect(markdown).toContain('<summary>详情标题</summary>')
    expect(markdown).toContain('《被引用文档》')
    expect(markdown).toContain('![画布：画布](')
    expect(markdown).toContain('![思维导图：思维导图](')
    expect(markdown).toContain('[附件：资料.pdf](')
    expect(markdown).not.toContain('data:image')
    expect(hashString(markdown)).toBe('8de93ddb')
  })

  it('emits a visible placeholder for a failed resource', () => {
    const editor = createTestEditor()
    const document = createFullDocumentFixture()
    const manifest = manifestForFixture()
    const canvas = Object.values(manifest.resources).find((entry) => entry.kind === 'canvas')!
    canvas.status = 'failed'
    canvas.error = '画布不存在'
    delete canvas.relativePath

    const markdown = serializeDocumentMarkdown(editor, document, {
      vaultId: 'vault', documentId: 'document', title: '失败示例',
      createdAt: '2026-08-30T01:02:03.000Z', updatedAt: '2026-08-30T01:02:03.000Z',
    }, manifest)
    editor.destroy()

    expect(markdown).toContain('> ⚠️ 画布未能导出：画布不存在')
  })

  it('keeps every missing native resource visible instead of dropping its node', () => {
    const editor = createTestEditor()
    const document = createFullDocumentFixture()
    const manifest = manifestForFixture()
    Object.values(manifest.resources).forEach((entry) => {
      entry.status = 'failed'
      entry.error = `${entry.label}不存在`
      delete entry.relativePath
    })

    const markdown = serializeDocumentMarkdown(editor, document, {
      vaultId: 'vault', documentId: 'document', title: '缺失资源',
      createdAt: '2026-08-30T01:02:03.000Z', updatedAt: '2026-08-30T01:02:03.000Z',
    }, manifest)
    editor.destroy()

    for (const label of ['画布', '思维导图', '工作区图片', '资料.pdf', '被引用文档']) {
      expect(markdown).toContain(`⚠️ ${label}未能导出`)
    }
    expect(markdown).toContain('详情正文')
  })

  it('materializes a data URL image through the manifest without embedding its bytes', () => {
    const editor = createTestEditor()
    const nodeId = '00000000-0000-4000-8000-000000008001'
    const document = {
      type: 'doc' as const,
      content: [{
        type: 'image',
        attrs: { nodeId, src: 'data:image/png;base64,iVBORw0KGgo=', alt: '内嵌图片' },
      }],
    }
    const plan = collectMarkdownExportResources(document)
    const resource = plan.resources[0]
    const markdown = serializeDocumentMarkdown(editor, document, {
      vaultId: 'vault', documentId: 'document', title: '图片',
      createdAt: '2026-08-30T01:02:03.000Z', updatedAt: '2026-08-30T01:02:03.000Z',
    }, {
      assetDirectoryName: '图片.assets',
      nodeResources: plan.nodeResources,
      resources: {
        [resource.resourceKey]: {
          ...resource,
          status: 'ready',
          relativePath: '图片.assets/images/image.png',
        },
      },
    })
    editor.destroy()

    expect(markdown).toContain('![内嵌图片](<./图片.assets/images/image.png>)')
    expect(markdown).not.toContain('data:image')
  })

  it('flattens nested cell blocks into a native GFM table', () => {
    const editor = createTestEditor()
    const document = createFullDocumentFixture()
    const table = document.content!.find((node) => node.type === 'table')!
    table.content![1].content![0].content!.push({
      type: 'bulletList',
      attrs: { nodeId: '00000000-0000-4000-8000-000000009999' },
      content: [{
        type: 'listItem', attrs: { nodeId: '00000000-0000-4000-8000-000000009998' },
        content: [{
          type: 'paragraph', attrs: { nodeId: '00000000-0000-4000-8000-000000009997' },
          content: [{ type: 'text', text: '嵌套列表' }],
        }],
      }],
    })
    const markdown = serializeDocumentMarkdown(editor, document, {
      vaultId: 'vault', documentId: 'document', title: '复杂表格',
      createdAt: '2026-08-30T01:02:03.000Z', updatedAt: '2026-08-30T01:02:03.000Z',
    }, manifestForFixture())
    editor.destroy()

    expect(markdown).toContain('| 列 A')
    expect(markdown).toContain('嵌套列表')
    expect(markdown).not.toContain('<table')
  })

  it('flattens merged cells into a native GFM table', () => {
    const editor = createTestEditor()
    const document = createFullDocumentFixture()
    const table = document.content!.find((node) => node.type === 'table')!
    table.content![1].content = [{
      type: 'tableCell',
      attrs: {
        nodeId: '00000000-0000-4000-8000-000000009996',
        colspan: 2,
        rowspan: 1,
        colwidth: null,
      },
      content: [{
        type: 'paragraph',
        attrs: { nodeId: '00000000-0000-4000-8000-000000009995' },
        content: [{ type: 'text', text: '合并单元格' }],
      }],
    }]

    const markdown = serializeDocumentMarkdown(editor, document, {
      vaultId: 'vault', documentId: 'document', title: '合并表格',
      createdAt: '2026-08-30T01:02:03.000Z', updatedAt: '2026-08-30T01:02:03.000Z',
    }, manifestForFixture())
    editor.destroy()

    expect(markdown).toContain('| 列 A')
    expect(markdown).toContain('合并单元格')
    expect(markdown).not.toContain('<table')
    expect(markdown).not.toContain('colspan=')
  })
})
