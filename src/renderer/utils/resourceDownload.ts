import type { ExcalidrawScene } from '@shared/knowledge-types'
import { blobToDataUrl, renderMindMapStatic, type MindMapExportFormat } from '../mindmap/mindMapExport'

export async function downloadCanvasReference(
  vaultId: string,
  canvasId: string,
) {
  const result = await window.electronAPI.knowledge.getCanvas(vaultId, canvasId)
  if (!result.ok) return false
  const { exportToBlob } = await import('@excalidraw/excalidraw')
  const scene = result.data as ExcalidrawScene
  const blob = await exportToBlob({
    elements: scene.elements as any,
    appState: { ...scene.appState, exportBackground: true } as any,
    files: scene.files as any,
    exportPadding: 20,
    mimeType: 'image/png',
  })
  await window.electronAPI.file.downloadImage(await blobToDataUrl(blob), '画布.png')
  return true
}

export async function downloadMindMapReference(
  vaultId: string,
  mindmapId: string,
  format: MindMapExportFormat = 'png',
) {
  const result = await window.electronAPI.knowledge.getMindMap(vaultId, mindmapId)
  if (!result.ok) return false
  const blob = await renderMindMapStatic(result.data, format)
  await window.electronAPI.file.downloadImage(await blobToDataUrl(blob), `思维导图.${format}`)
  return true
}
