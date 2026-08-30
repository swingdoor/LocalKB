import type {
  MarkdownExportManifest,
  MarkdownExportManifestEntry,
} from '@shared/markdown-export-types'
import type { JSONContent } from '@tiptap/core'
import {
  encodeMarkdownRelativePath,
  escapeMarkdownLabel,
} from '@shared/markdown-export-utils'

let activeManifest: MarkdownExportManifest | null = null

function entryForNode(node: JSONContent): MarkdownExportManifestEntry | null {
  const nodeId = typeof node.attrs?.nodeId === 'string' ? node.attrs.nodeId : ''
  const resourceKey = activeManifest?.nodeResources[nodeId]
  return resourceKey ? activeManifest?.resources[resourceKey] ?? null : null
}

function warning(entry: MarkdownExportManifestEntry | null, fallback: string): string {
  const label = escapeMarkdownLabel(entry?.label ?? fallback)
  const reason = escapeMarkdownLabel(entry?.error ?? '导出资源清单缺失')
  return `> ⚠️ ${label}未能导出：${reason}`
}

export function withMarkdownExportManifest<T>(
  manifest: MarkdownExportManifest,
  callback: () => T,
): T {
  if (activeManifest) throw new Error('Markdown serializer 不允许并发使用导出清单')
  activeManifest = manifest
  try {
    return callback()
  } finally {
    activeManifest = null
  }
}

export function renderManifestResourceMarkdown(node: JSONContent): string {
  const entry = entryForNode(node)
  if (!entry || entry.status === 'failed') return warning(entry, '资源')

  const label = escapeMarkdownLabel(entry.displayName ?? entry.label)
  if (entry.kind === 'documentReference') return `《${label}》`
  if (!entry.relativePath) return warning(entry, label)
  const target = encodeMarkdownRelativePath(entry.relativePath)
  if (entry.kind === 'attachment') return `[附件：${label}](${target})`
  if (entry.kind === 'canvas') return `![画布：${label}](${target})`
  if (entry.kind === 'mindmap') return `![思维导图：${label}](${target})`
  return `![${label}](${target})`
}

export function renderImageMarkdown(node: JSONContent): string {
  const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
  const alt = escapeMarkdownLabel(typeof node.attrs?.alt === 'string' ? node.attrs.alt : '')
  const title = typeof node.attrs?.title === 'string' && node.attrs.title.trim()
    ? ` \"${node.attrs.title.replace(/[\r\n\"]/g, ' ')}\"`
    : ''
  if (/^https?:\/\//i.test(src)) return `![${alt}](${src}${title})`
  return renderManifestResourceMarkdown(node)
}
