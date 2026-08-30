import type { TipTapDocument } from '@shared/knowledge-types'

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

export const FULL_DOCUMENT_RESOURCE_IDS = {
  canvas: id('901'),
  mindmap: id('902'),
  assetImage: id('903'),
  attachment: id('904'),
  document: id('905'),
} as const

let nextNodeId = 1
const attrs = (extra: Record<string, unknown> = {}) => ({ nodeId: id(String(nextNodeId++)), ...extra })

export function createFullDocumentFixture(): TipTapDocument {
  nextNodeId = 1
  return {
    type: 'doc',
    content: [
      {
        type: 'heading', attrs: attrs({ level: 1, textAlign: 'center' }),
        content: [{ type: 'text', text: '完整导出示例' }],
      },
      {
        type: 'paragraph', attrs: attrs(), content: [
          { type: 'text', text: '粗体', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' 斜体', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' 删除线', marks: [{ type: 'strike' }] },
          { type: 'text', text: ' 代码', marks: [{ type: 'code' }] },
          { type: 'text', text: ' 链接', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
          { type: 'text', text: ' 下划线', marks: [{ type: 'underline' }] },
          { type: 'text', text: ' 高亮', marks: [{ type: 'highlight', attrs: { color: '#fef08a' } }] },
          { type: 'text', text: ' 样式文本', marks: [{ type: 'textStyle', attrs: { color: '#2563eb', fontFamily: 'serif', fontSize: '18px' } }] },
          { type: 'hardBreak', attrs: attrs() },
          { type: 'text', text: '换行后' },
          {
            type: 'documentReference',
            attrs: attrs({ documentId: FULL_DOCUMENT_RESOURCE_IDS.document, label: '被引用文档' }),
          },
        ],
      },
      {
        type: 'blockquote', attrs: attrs(), content: [
          { type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '引用内容' }] },
        ],
      },
      {
        type: 'bulletList', attrs: attrs(), content: [
          {
            type: 'listItem', attrs: attrs(), content: [
              { type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '无序项目' }] },
              {
                type: 'orderedList', attrs: attrs({ start: 3 }), content: [
                  {
                    type: 'listItem', attrs: attrs(), content: [
                      { type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '嵌套有序项目' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'taskList', attrs: attrs(), content: [
          {
            type: 'taskItem', attrs: attrs({ checked: true }), content: [
              { type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '已完成任务' }] },
            ],
          },
        ],
      },
      {
        type: 'codeBlock', attrs: attrs({ language: 'typescript' }),
        content: [{ type: 'text', text: 'const answer = 42' }],
      },
      {
        type: 'table', attrs: attrs(), content: [
          {
            type: 'tableRow', attrs: attrs(), content: [
              { type: 'tableHeader', attrs: attrs(), content: [{ type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '列 A' }] }] },
              { type: 'tableHeader', attrs: attrs(), content: [{ type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '列 B' }] }] },
            ],
          },
          {
            type: 'tableRow', attrs: attrs(), content: [
              { type: 'tableCell', attrs: attrs(), content: [{ type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: 'A1' }] }] },
              { type: 'tableCell', attrs: attrs(), content: [{ type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: 'B1' }] }] },
            ],
          },
        ],
      },
      { type: 'horizontalRule', attrs: attrs() },
      {
        type: 'image',
        attrs: attrs({ src: 'https://example.com/image.png', alt: '远程图片', title: '图片标题', width: 320, textAlign: 'right' }),
      },
      { type: 'canvasReference', attrs: attrs({ canvasId: FULL_DOCUMENT_RESOURCE_IDS.canvas, width: 640, height: 420, textAlign: 'center' }) },
      { type: 'mindmapReference', attrs: attrs({ mindmapId: FULL_DOCUMENT_RESOURCE_IDS.mindmap, width: 640, height: 420, textAlign: 'left' }) },
      { type: 'assetImage', attrs: attrs({ assetId: FULL_DOCUMENT_RESOURCE_IDS.assetImage, alt: '工作区图片', width: 480, textAlign: 'left' }) },
      {
        type: 'fileAttachment',
        attrs: attrs({
          assetId: FULL_DOCUMENT_RESOURCE_IDS.attachment,
          displayName: '资料.pdf',
        }),
      },
      {
        type: 'details', attrs: attrs(), content: [
          { type: 'detailsSummary', attrs: attrs(), content: [{ type: 'text', text: '详情标题' }] },
          {
            type: 'detailsContent', attrs: attrs(), content: [
              { type: 'paragraph', attrs: attrs(), content: [{ type: 'text', text: '详情正文' }] },
            ],
          },
        ],
      },
    ],
  }
}
