import type { Editor } from '@tiptap/core'
import type { ExcalidrawScene, LoadedCanvas } from '@shared/knowledge-types'
import type {
  MarkdownExportCommitResult,
  MarkdownExportResourceDescriptor,
  MarkdownExportSnapshot,
  MarkdownExportWarning,
  MarkdownGeneratedResource,
} from '@shared/markdown-export-types'
import { renderMindMapStatic } from '../mindmap/mindMapExport'
import { collectMarkdownExportResources, decodeDataImage } from './markdownExportPlan'
import { serializeDocumentMarkdown } from './markdownSerializer'

export type DocumentMarkdownExportResult =
  | { canceled: true }
  | { canceled: false; result: MarkdownExportCommitResult }

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '资源生成失败'
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

async function renderCanvasPng(
  descriptor: Extract<MarkdownExportResourceDescriptor, { kind: 'canvas' }>,
  snapshot: MarkdownExportSnapshot,
): Promise<MarkdownGeneratedResource> {
  const result = await window.electronAPI.knowledge.getCanvas(
    snapshot.metadata.vaultId, descriptor.canvasId,
  )
  if (!result.ok) throw new Error(result.error.message)
  const value = result.data as LoadedCanvas | ExcalidrawScene
  const scene: ExcalidrawScene = (value as LoadedCanvas).contentType === 'canvas'
    ? (value as LoadedCanvas).content
    : value as ExcalidrawScene
  const { exportToBlob } = await import('@excalidraw/excalidraw')
  const blob = await exportToBlob({
    elements: scene.elements as any,
    appState: { ...scene.appState, exportBackground: true } as any,
    files: scene.files as any,
    exportPadding: 20,
    mimeType: 'image/png',
  })
  return { resourceKey: descriptor.resourceKey, mimeType: 'image/png', bytes: await blobBytes(blob) }
}

async function renderMindMapPng(
  descriptor: Extract<MarkdownExportResourceDescriptor, { kind: 'mindmap' }>,
  snapshot: MarkdownExportSnapshot,
): Promise<MarkdownGeneratedResource> {
  const result = await window.electronAPI.knowledge.getMindMap(
    snapshot.metadata.vaultId, descriptor.mindmapId,
  )
  if (!result.ok) throw new Error(result.error.message)
  const blob = await renderMindMapStatic(result.data, 'png')
  return { resourceKey: descriptor.resourceKey, mimeType: 'image/png', bytes: await blobBytes(blob) }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(values[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
  return results
}

export async function exportDocumentMarkdown(
  editor: Editor,
  snapshot: MarkdownExportSnapshot,
  signal?: AbortSignal,
): Promise<DocumentMarkdownExportResult> {
  const plan = collectMarkdownExportResources(snapshot.document)
  const begin = await window.electronAPI.file.beginMarkdownExport({
    metadata: snapshot.metadata,
    resources: plan.resources,
  })
  if (begin.canceled) return { canceled: true }

  const runtimeWarnings: MarkdownExportWarning[] = []
  const descriptors = plan.resources.filter((descriptor) => {
    const entry = begin.manifest.resources[descriptor.resourceKey]
    return entry?.status === 'ready' && (
      descriptor.kind === 'canvas' || descriptor.kind === 'mindmap' || descriptor.kind === 'dataImage'
    )
  })
  const generated = await mapWithConcurrency(descriptors, 2, async (descriptor) => {
    if (signal?.aborted) throw new DOMException('导出已取消', 'AbortError')
    try {
      if (descriptor.kind === 'canvas') return await renderCanvasPng(descriptor, snapshot)
      if (descriptor.kind === 'mindmap') return await renderMindMapPng(descriptor, snapshot)
      if (descriptor.kind === 'dataImage') {
        const source = plan.dataImages[descriptor.resourceKey]
        if (!source) throw new Error('data URL 图片数据缺失')
        return decodeDataImage(descriptor.resourceKey, source)
      }
      return null
    } catch (error) {
      if (signal?.aborted) throw error
      const message = failureMessage(error)
      const entry = begin.manifest.resources[descriptor.resourceKey]
      entry.status = 'failed'
      entry.error = message
      delete entry.relativePath
      runtimeWarnings.push({
        resourceKey: descriptor.resourceKey,
        nodeIds: descriptor.nodeIds,
        kind: descriptor.kind,
        label: descriptor.label,
        message,
      })
      return null
    }
  })
  if (signal?.aborted) throw new DOMException('导出已取消', 'AbortError')

  const markdown = serializeDocumentMarkdown(
    editor, snapshot.document, snapshot.metadata, begin.manifest,
  )
  const result = await window.electronAPI.file.commitMarkdownExport({
    exportId: begin.exportId,
    markdown,
    generatedResources: generated.filter(
      (resource): resource is MarkdownGeneratedResource => resource !== null,
    ),
    warnings: runtimeWarnings,
  })
  return { canceled: false, result }
}
