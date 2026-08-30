import { describe, expect, it } from 'vitest'
import type { TipTapDocument } from '@shared/knowledge-types'
import { collectMarkdownExportResources, decodeDataImage } from './markdownExportPlan'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

describe('collectMarkdownExportResources', () => {
  it('deduplicates resources while mapping every stable node id', () => {
    const document: TipTapDocument = {
      type: 'doc',
      content: [
        { type: 'canvasReference', attrs: { nodeId: id(1), canvasId: id(100) } },
        { type: 'canvasReference', attrs: { nodeId: id(2), canvasId: id(100) } },
        {
          type: 'paragraph', attrs: { nodeId: id(3) }, content: [
            { type: 'documentReference', attrs: { nodeId: id(4), documentId: id(200), label: '参考' } },
          ],
        },
      ],
    }

    const plan = collectMarkdownExportResources(document)

    expect(plan.resources).toHaveLength(2)
    expect(plan.resources[0]).toMatchObject({
      resourceKey: `canvas:${id(100)}`,
      nodeIds: [id(1), id(2)],
    })
    expect(plan.nodeResources).toEqual({
      [id(1)]: `canvas:${id(100)}`,
      [id(2)]: `canvas:${id(100)}`,
      [id(4)]: `document:${id(200)}`,
    })
  })

  it('keeps remote images external and materializes data images once', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const document: TipTapDocument = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { nodeId: id(1), src: 'https://example.com/a.png' } },
        { type: 'image', attrs: { nodeId: id(2), src: dataUrl, alt: '内嵌图' } },
        { type: 'image', attrs: { nodeId: id(3), src: dataUrl, alt: '重复图' } },
      ],
    }

    const plan = collectMarkdownExportResources(document)
    expect(plan.resources).toHaveLength(1)
    expect(plan.resources[0].kind).toBe('dataImage')
    expect(plan.resources[0].nodeIds).toEqual([id(2), id(3)])
    const [resourceKey] = Object.keys(plan.dataImages)
    expect(decodeDataImage(resourceKey, plan.dataImages[resourceKey]).bytes).toEqual(
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  })

  it('classifies arbitrary local image paths as failed resources', () => {
    const document: TipTapDocument = {
      type: 'doc',
      content: [{ type: 'image', attrs: { nodeId: id(1), src: '/Users/me/private.png' } }],
    }

    expect(collectMarkdownExportResources(document).resources[0]).toMatchObject({
      kind: 'unsupportedImage',
      reason: '不支持读取本地路径或未知图片协议',
    })
  })
})
