import type { MindMapData } from '@shared/knowledge-types'
import { createOffscreenMindMap } from './mindElixirAdapter'
import { MIND_MAP_EXPORT_CSS } from './mindElixirTheme'

export type MindMapExportFormat = 'png' | 'svg'

function afterFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export async function renderMindMapStatic(
  data: MindMapData,
  format: MindMapExportFormat,
): Promise<Blob> {
  const container = document.createElement('div')
  container.dataset.mindmapOffscreen = format
  container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1200px;height:800px;overflow:visible;background:#fff;'
  document.body.appendChild(container)
  const surface = createOffscreenMindMap(container, data)
  try {
    await document.fonts?.ready
    await afterFrame()
    surface.instance.scaleFit()
    await afterFrame()
    if (format === 'svg') return surface.instance.exportSvg(true, MIND_MAP_EXPORT_CSS)
    const blob = await surface.instance.exportPng(true, MIND_MAP_EXPORT_CSS)
    if (!blob) throw new Error('思维导图 PNG 生成失败')
    return blob
  } finally {
    surface.dispose()
    container.remove()
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onloadend = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}
