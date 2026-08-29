import type { ExcalidrawScene } from '@shared/knowledge-types'
import type { MindElixirInstance } from 'mind-elixir'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onloadend = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export async function downloadCanvasReference(
  vaultId: string,
  documentId: string,
  canvasId: string,
) {
  const result = await window.electronAPI.knowledge.getCanvas(vaultId, canvasId, documentId)
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
  documentId: string,
  mindmapId: string,
) {
  const result = await window.electronAPI.knowledge.getMindMap(vaultId, documentId, mindmapId)
  if (!result.ok) return false
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1200px;height:800px;'
  document.body.appendChild(container)
  let mind: MindElixirInstance | null = null
  try {
    const { default: MindElixir } = await import('mind-elixir')
    mind = new MindElixir({
      el: container,
      editable: false,
      keypress: false,
      toolBar: false,
      contextMenu: false,
    } as any)
    mind.init(result.data as any)
    const blob = await mind.exportPng(true, '0')
    if (!blob) return false
    await window.electronAPI.file.downloadImage(await blobToDataUrl(blob), '思维导图.png')
    return true
  } finally {
    mind?.destroy()
    container.remove()
  }
}
