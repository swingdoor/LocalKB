import type { ExcalidrawScene } from '@shared/knowledge-types'

function placeholder(label: string): HTMLElement {
  const element = document.createElement('div')
  element.textContent = label
  element.setAttribute('role', 'note')
  element.style.cssText = 'padding:16px;border:1px dashed #bbb;color:#666;border-radius:6px;'
  return element
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

async function resolveCanvas(
  element: HTMLElement,
  vaultId: string,
  documentId: string,
): Promise<void> {
  const canvasId = element.dataset.canvasId
  if (!canvasId) { element.replaceWith(placeholder('画布引用无效')); return }
  const result = await window.electronAPI.knowledge.getCanvas(vaultId, canvasId, documentId)
  if (!result.ok) { element.replaceWith(placeholder('画布资源不可用')); return }
  try {
    const { exportToSvg } = await import('@excalidraw/excalidraw')
    const scene = result.data as ExcalidrawScene
    const svg = await exportToSvg({
      elements: scene.elements as any,
      appState: { ...scene.appState, exportBackground: true } as any,
      files: scene.files as any,
      exportPadding: 20,
    })
    svg.style.maxWidth = '100%'
    svg.style.height = 'auto'
    element.replaceChildren(svg)
  } catch {
    element.replaceWith(placeholder('画布预览生成失败'))
  }
}

async function resolveMindMap(
  element: HTMLElement,
  vaultId: string,
  documentId: string,
): Promise<void> {
  const mindmapId = element.dataset.mindmapId
  if (!mindmapId) { element.replaceWith(placeholder('思维导图引用无效')); return }
  const result = await window.electronAPI.knowledge.getMindMap(vaultId, documentId, mindmapId)
  if (!result.ok) { element.replaceWith(placeholder('思维导图资源不可用')); return }
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1200px;height:800px;'
  document.body.appendChild(container)
  try {
    const { default: MindElixir } = await import('mind-elixir')
    const mind = new MindElixir({ el: container, keypress: false, toolBar: false, contextMenu: false } as any)
    mind.init(result.data as any)
    const blob = mind.exportSvg(true, '0')
    if (!blob) throw new Error('思维导图导出失败')
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml').documentElement
    svg.setAttribute('style', 'max-width:100%;height:auto')
    element.replaceChildren(document.importNode(svg, true))
  } catch {
    element.replaceWith(placeholder('思维导图预览生成失败'))
  } finally {
    container.remove()
  }
}

async function resolveAsset(
  element: HTMLImageElement,
  vaultId: string,
  documentId: string,
): Promise<void> {
  const assetId = element.dataset.assetId
  if (!assetId) { element.replaceWith(placeholder('图片引用无效')); return }
  try {
    const url = `localkb-resource://asset/${encodeURIComponent(vaultId)}/${encodeURIComponent(documentId)}/${encodeURIComponent(assetId)}`
    const response = await fetch(url)
    if (!response.ok) throw new Error('图片资源不可用')
    element.src = await blobToDataUrl(await response.blob())
  } catch {
    element.replaceWith(placeholder('图片资源不可用'))
  }
}

export async function resolveResourceReferencesForExport(
  html: string,
  vaultId: string,
  documentId: string,
): Promise<string> {
  const container = document.createElement('div')
  container.innerHTML = html
  await Promise.all([
    ...[...container.querySelectorAll<HTMLElement>('[data-canvas-reference]')]
      .map((element) => resolveCanvas(element, vaultId, documentId)),
    ...[...container.querySelectorAll<HTMLElement>('[data-mindmap-reference]')]
      .map((element) => resolveMindMap(element, vaultId, documentId)),
    ...[...container.querySelectorAll<HTMLImageElement>('img[data-asset-image]')]
      .map((element) => resolveAsset(element, vaultId, documentId)),
  ])
  return container.innerHTML
}
