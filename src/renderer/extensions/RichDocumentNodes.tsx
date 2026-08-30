import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Download, ExternalLink, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AssetMetadata } from '@shared/knowledge-types'
import { TIPTAP_REFERENCE_NODE_TYPES } from '@shared/knowledge-types'
import { useAppStore } from '../stores/appStore'
import { renderManifestResourceMarkdown } from '../markdown/markdownSerializationContext'

interface DocumentReferenceOptions {
  onOpen: (documentId: string) => void
}

interface FileAttachmentOptions {
  vaultId: string
}

function DocumentReferenceView({ node, extension, selected, editor, getPos }: any) {
  const { documentId, label } = node.attrs as { documentId: string; label: string | null }
  const options = extension.options as DocumentReferenceOptions
  const currentTitle = useAppStore((state) => state.contents.find(
    (item) => item.id === documentId && item.contentType === 'document',
  )?.title)
  const title = currentTitle ?? label ?? '文档不存在'

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className={`document-reference ${selected ? 'is-selected' : ''}`}
      data-missing={currentTitle ? undefined : 'true'}
      title={currentTitle ? `打开文档：${title}` : '引用的文档不存在'}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const position = getPos()
        if (typeof position === 'number') editor.chain().focus().setNodeSelection(position).run()
      }}
      onDoubleClick={(event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        options.onOpen(documentId)
      }}
    >
      <FileText aria-hidden="true" size={14} />
      <span>{title}</span>
    </NodeViewWrapper>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileAttachmentView({ node, selected, extension, editor, getPos }: any) {
  const { assetId, displayName } = node.attrs as {
    assetId: string
    displayName?: string
  }
  const options = extension.options as FileAttachmentOptions
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<AssetMetadata | null>(null)
  const fileName = displayName || metadata?.fileName || '未命名文件'

  useEffect(() => {
    let cancelled = false
    setMetadata(null)
    void window.electronAPI.knowledge.getAssetMetadata(options.vaultId, assetId).then((result) => {
      if (cancelled) return
      if (result.ok) setMetadata(result.data)
      else setError(result.error.message)
    })
    return () => { cancelled = true }
  }, [assetId, options.vaultId])

  const selectNode = () => {
    const position = getPos()
    if (typeof position === 'number') editor.chain().focus().setNodeSelection(position).run()
  }

  const open = async () => {
    setError(null)
    const result = await window.electronAPI.knowledge.openAsset(
      options.vaultId, assetId, fileName,
    )
    if (!result.ok) setError(result.error.message)
  }

  const saveAs = async () => {
    setError(null)
    const result = await window.electronAPI.knowledge.saveAssetAs(
      options.vaultId, assetId, fileName,
    )
    if (!result.ok) setError(result.error.message)
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
      className={`file-attachment ${selected ? 'is-selected' : ''}`}
      onClick={selectNode}
    >
      <div className="file-attachment-icon"><FileText aria-hidden="true" size={20} /></div>
      <div className="file-attachment-meta">
        <div className="file-attachment-name" title={fileName}>{fileName}</div>
        <div className="file-attachment-detail">
          {metadata ? formatFileSize(metadata.size) : '读取中…'}
        </div>
        {error && <div className="file-attachment-error">{error}</div>}
      </div>
      <div className="file-attachment-actions" data-file-attachment-control="">
        <button type="button" title="打开附件" onClick={(event) => { event.stopPropagation(); void open() }}>
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button type="button" title="另存为" onClick={(event) => { event.stopPropagation(); void saveAs() }}>
          <Download aria-hidden="true" size={16} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}

function stopFileAttachmentEvent({ event }: { event: Event }): boolean {
  const target = event.target
  return target instanceof Element && Boolean(target.closest('[data-file-attachment-control]'))
}

export const DocumentReferenceNode = Node.create<DocumentReferenceOptions>({
  name: TIPTAP_REFERENCE_NODE_TYPES.document,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ onOpen: () => undefined }),
  addAttributes: () => ({
    documentId: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-document-id'),
      renderHTML: (attributes) => ({ 'data-document-id': attributes.documentId }),
    },
    label: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-label'),
      renderHTML: (attributes) => attributes.label ? { 'data-label': attributes.label } : {},
    },
  }),
  parseHTML: () => [{ tag: 'span[data-document-reference]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-document-reference': '' }),
    String(node.attrs.label ?? '文档引用'),
  ],
  renderMarkdown: renderManifestResourceMarkdown,
  addNodeView: () => ReactNodeViewRenderer(DocumentReferenceView),
})

export const FileAttachmentNode = Node.create<FileAttachmentOptions>({
  name: TIPTAP_REFERENCE_NODE_TYPES.attachment,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addOptions: () => ({ vaultId: '' }),
  addAttributes: () => ({
    assetId: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-asset-id'),
      renderHTML: (attributes) => ({ 'data-asset-id': attributes.assetId }),
    },
    displayName: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-display-name'),
      renderHTML: (attributes) => attributes.displayName
        ? { 'data-display-name': attributes.displayName }
        : {},
    },
  }),
  parseHTML: () => [{ tag: 'div[data-file-attachment]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-file-attachment': '' }),
    `附件：${String(node.attrs.displayName ?? '未命名文件')}`,
  ],
  renderMarkdown: renderManifestResourceMarkdown,
  addNodeView: () => ReactNodeViewRenderer(FileAttachmentView, { stopEvent: stopFileAttachmentEvent }),
})
