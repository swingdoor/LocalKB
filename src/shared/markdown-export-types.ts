import type { TipTapDocument } from './knowledge-types'

export type MarkdownExportResourceKind =
  | 'canvas'
  | 'mindmap'
  | 'assetImage'
  | 'attachment'
  | 'documentReference'
  | 'dataImage'
  | 'unsupportedImage'

interface MarkdownExportResourceDescriptorBase {
  resourceKey: string
  kind: MarkdownExportResourceKind
  nodeIds: string[]
  label: string
}

export interface MarkdownExportCanvasDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'canvas'
  canvasId: string
}

export interface MarkdownExportMindMapDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'mindmap'
  mindmapId: string
}

export interface MarkdownExportAssetImageDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'assetImage'
  assetId: string
  alt?: string
}

export interface MarkdownExportAttachmentDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'attachment'
  assetId: string
  displayName?: string
}

export interface MarkdownExportDocumentReferenceDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'documentReference'
  referencedDocumentId: string
  fallbackLabel?: string
}

export interface MarkdownExportDataImageDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'dataImage'
  mimeType: string
}

export interface MarkdownExportUnsupportedImageDescriptor extends MarkdownExportResourceDescriptorBase {
  kind: 'unsupportedImage'
  reason: string
}

export type MarkdownExportResourceDescriptor =
  | MarkdownExportCanvasDescriptor
  | MarkdownExportMindMapDescriptor
  | MarkdownExportAssetImageDescriptor
  | MarkdownExportAttachmentDescriptor
  | MarkdownExportDocumentReferenceDescriptor
  | MarkdownExportDataImageDescriptor
  | MarkdownExportUnsupportedImageDescriptor

export interface MarkdownExportMetadata {
  vaultId: string
  documentId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MarkdownExportWarning {
  resourceKey: string
  nodeIds: string[]
  kind: MarkdownExportResourceKind
  label: string
  message: string
}

export interface MarkdownExportManifestEntry {
  resourceKey: string
  kind: MarkdownExportResourceKind
  nodeIds: string[]
  label: string
  status: 'ready' | 'failed'
  relativePath?: string
  displayName?: string
  mimeType?: string
  error?: string
}

export interface MarkdownExportManifest {
  assetDirectoryName: string
  nodeResources: Record<string, string>
  resources: Record<string, MarkdownExportManifestEntry>
}

export interface MarkdownExportBeginRequest {
  metadata: MarkdownExportMetadata
  resources: MarkdownExportResourceDescriptor[]
}

export type MarkdownExportBeginResult =
  | { canceled: true }
  | {
    canceled: false
    exportId: string
    manifest: MarkdownExportManifest
    warnings: MarkdownExportWarning[]
  }

export interface MarkdownGeneratedResource {
  resourceKey: string
  mimeType: string
  bytes: Uint8Array
}

export interface MarkdownExportCommitRequest {
  exportId: string
  markdown: string
  generatedResources: MarkdownGeneratedResource[]
  warnings: MarkdownExportWarning[]
}

export interface MarkdownExportCommitResult {
  success: true
  revealId: string
  warningCount: number
  warnings: MarkdownExportWarning[]
}

export interface MarkdownExportSnapshot {
  document: TipTapDocument
  metadata: MarkdownExportMetadata
}
