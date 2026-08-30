import type {
  MarkdownExportResourceDescriptor,
  MarkdownExportResourceKind,
} from '@shared/markdown-export-types'
import type { TipTapDocument, TipTapNode } from '@shared/knowledge-types'
import { hashString } from '@shared/markdown-export-utils'
import { assertMarkdownExportDocument } from '@shared/markdown-export-validation'

export interface MarkdownExportPlan {
  resources: MarkdownExportResourceDescriptor[]
  nodeResources: Record<string, string>
  dataImages: Record<string, { mimeType: string; dataUrl: string }>
}

const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,/i

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function collectMarkdownExportResources(document: TipTapDocument): MarkdownExportPlan {
  assertMarkdownExportDocument(document)
  const resources = new Map<string, MarkdownExportResourceDescriptor>()
  const nodeResources: Record<string, string> = {}
  const dataImages: MarkdownExportPlan['dataImages'] = {}

  const add = (descriptor: MarkdownExportResourceDescriptor) => {
    descriptor.nodeIds.forEach((nodeId) => { nodeResources[nodeId] = descriptor.resourceKey })
    const existing = resources.get(descriptor.resourceKey)
    if (existing) {
      existing.nodeIds = [...new Set([...existing.nodeIds, ...descriptor.nodeIds])]
      return
    }
    resources.set(descriptor.resourceKey, descriptor)
  }

  const descriptorBase = (
    node: TipTapNode,
    resourceKey: string,
    kind: MarkdownExportResourceKind,
    label: string,
  ) => ({
    resourceKey,
    kind,
    nodeIds: [String(node.attrs?.nodeId)],
    label,
  })

  const visit = (node: TipTapNode) => {
    const nodeId = String(node.attrs?.nodeId ?? '')
    if (node.type === 'canvasReference') {
      const canvasId = String(node.attrs?.canvasId)
      add({
        ...descriptorBase(node, `canvas:${canvasId}`, 'canvas', '画布'),
        kind: 'canvas',
        canvasId,
      })
    } else if (node.type === 'mindmapReference') {
      const mindmapId = String(node.attrs?.mindmapId)
      add({
        ...descriptorBase(node, `mindmap:${mindmapId}`, 'mindmap', '思维导图'),
        kind: 'mindmap',
        mindmapId,
      })
    } else if (node.type === 'assetImage') {
      const assetId = String(node.attrs?.assetId)
      const alt = text(node.attrs?.alt)
      add({
        ...descriptorBase(node, `asset-image:${assetId}`, 'assetImage', alt ?? '工作区图片'),
        kind: 'assetImage',
        assetId,
        ...(alt ? { alt } : {}),
      })
    } else if (node.type === 'fileAttachment') {
      const assetId = String(node.attrs?.assetId)
      const fileName = String(node.attrs?.fileName)
      add({
        ...descriptorBase(node, `attachment:${assetId}`, 'attachment', fileName),
        kind: 'attachment',
        assetId,
        fileName,
        mimeType: String(node.attrs?.mimeType),
        size: numberValue(node.attrs?.size) ?? 0,
      })
    } else if (node.type === 'documentReference') {
      const referencedDocumentId = String(node.attrs?.documentId)
      const fallbackLabel = text(node.attrs?.label)
      add({
        ...descriptorBase(
          node,
          `document:${referencedDocumentId}`,
          'documentReference',
          fallbackLabel ?? '文档引用',
        ),
        kind: 'documentReference',
        referencedDocumentId,
        ...(fallbackLabel ? { fallbackLabel } : {}),
      })
    } else if (node.type === 'image') {
      const src = String(node.attrs?.src ?? '')
      if (/^https?:\/\//i.test(src)) {
        // Remote images remain remote and need no export resource.
      } else {
        const dataMatch = DATA_IMAGE_PATTERN.exec(src)
        if (dataMatch) {
          const resourceKey = `data-image:${hashString(src)}`
          add({
            ...descriptorBase(node, resourceKey, 'dataImage', text(node.attrs?.alt) ?? '图片'),
            kind: 'dataImage',
            mimeType: dataMatch[1].toLowerCase(),
          })
          dataImages[resourceKey] = { mimeType: dataMatch[1].toLowerCase(), dataUrl: src }
        } else {
          const resourceKey = `unsupported-image:${nodeId}`
          add({
            ...descriptorBase(node, resourceKey, 'unsupportedImage', text(node.attrs?.alt) ?? '图片'),
            kind: 'unsupportedImage',
            reason: '不支持读取本地路径或未知图片协议',
          })
        }
      }
    }
    node.content?.forEach(visit)
  }

  visit(document)
  return { resources: [...resources.values()], nodeResources, dataImages }
}

export function decodeDataImage(
  resourceKey: string,
  value: { mimeType: string; dataUrl: string },
): { resourceKey: string; mimeType: string; bytes: Uint8Array } {
  const match = DATA_IMAGE_PATTERN.exec(value.dataUrl)
  if (!match || match[1].toLowerCase() !== value.mimeType) {
    throw new Error('图片 data URL 无效')
  }
  const encoded = value.dataUrl.slice(match[0].length)
  if (!encoded || encoded.length > 32 * 1024 * 1024) throw new Error('图片 data URL 大小无效')
  try {
    return {
      resourceKey,
      mimeType: value.mimeType,
      bytes: Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)),
    }
  } catch {
    throw new Error('图片 data URL 无法解码')
  }
}
