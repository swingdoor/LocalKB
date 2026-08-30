import type { ExcalidrawScene } from '@shared/knowledge-types'
import { blobToDataUrl, renderMindMapStatic } from '../mindmap/mindMapExport'

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
  try {
    const blob = await renderMindMapStatic(result.data, 'svg')
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml').documentElement
    svg.setAttribute('style', 'max-width:100%;height:auto')
    element.replaceChildren(document.importNode(svg, true))
  } catch {
    element.replaceWith(placeholder('思维导图预览生成失败'))
  }
}

export async function resolveMindMapReferenceForMarkdown(
  vaultId: string,
  documentId: string,
  mindmapId: string,
): Promise<string> {
  const result = await window.electronAPI.knowledge.getMindMap(vaultId, documentId, mindmapId)
  if (!result.ok) return '> 思维导图资源不可用'
  try {
    const blob = await renderMindMapStatic(result.data, 'png')
    return `![思维导图](${await blobToDataUrl(blob)})`
  } catch {
    return '> 思维导图预览生成失败'
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

async function resolveDocumentReference(element: HTMLElement, vaultId: string): Promise<void> {
  const documentId = element.dataset.documentId
  const fallback = element.dataset.label || element.textContent || '文档引用'
  if (!documentId) { element.textContent = fallback; return }
  const result = await window.electronAPI.knowledge.getDocument(vaultId, documentId)
  element.textContent = result.ok ? `文档：${result.data.title}` : `文档：${fallback}（不可用）`
}

function resolveFileAttachment(element: HTMLElement): void {
  const fileName = element.dataset.fileName || '未命名文件'
  const size = Number(element.dataset.size ?? 0)
  element.textContent = `附件：${fileName}${Number.isFinite(size) ? `（${size} 字节）` : ''}`
  element.style.cssText = 'padding:10px 12px;border:1px solid #ddd;border-radius:6px;color:#555;'
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
    ...[...container.querySelectorAll<HTMLElement>('[data-document-reference]')]
      .map((element) => resolveDocumentReference(element, vaultId)),
  ])
  container.querySelectorAll<HTMLElement>('[data-file-attachment]')
    .forEach(resolveFileAttachment)
  container.querySelectorAll<HTMLDetailsElement>('details').forEach((element) => {
    element.open = true
  })
  return container.innerHTML
}
