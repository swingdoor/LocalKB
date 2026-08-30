import type { Editor } from '@tiptap/core'
import '@tiptap/markdown'
import type { MarkdownExportManifest, MarkdownExportMetadata } from '@shared/markdown-export-types'
import type { TipTapDocument } from '@shared/knowledge-types'
import { createMarkdownFrontmatter } from '@shared/markdown-export-utils'
import { assertMarkdownExportDocument } from '@shared/markdown-export-validation'
import { withMarkdownExportManifest } from './markdownSerializationContext'

export function serializeDocumentMarkdown(
  editor: Editor,
  document: TipTapDocument,
  metadata: MarkdownExportMetadata,
  manifest: MarkdownExportManifest,
): string {
  assertMarkdownExportDocument(document)
  if (!editor.markdown) throw new Error('Markdown serializer 尚未初始化')
  const body = withMarkdownExportManifest(
    manifest,
    () => editor.markdown!.serialize(document).trimEnd(),
  )
  return `${createMarkdownFrontmatter(metadata)}${body}${body ? '\n' : ''}`
}
