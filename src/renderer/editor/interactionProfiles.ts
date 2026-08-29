import type { RootBlockNodeType } from './nodeCatalog'

export type BlockMenuKind =
  | 'paragraph'
  | 'heading'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'table'
  | 'horizontal-rule'
  | 'details'
  | 'resource'
  | 'attachment'
  | 'image'

export type NodeMenuKind =
  | 'image'
  | 'asset-image'
  | 'attachment'
  | 'canvas'
  | 'mindmap'
  | 'document-reference'

export interface InteractionProfile {
  nodeType: string
  rootBlock: boolean
  textMenu: boolean
  blockMenu: BlockMenuKind | null
  nodeMenu: NodeMenuKind | null
  localControls: 'code' | 'details' | 'table' | 'resource-preview' | 'resize' | 'attachment-card' | null
}

export const INTERACTION_PROFILES: Readonly<Record<string, InteractionProfile>> = {
  paragraph: { nodeType: 'paragraph', rootBlock: true, textMenu: true, blockMenu: 'paragraph', nodeMenu: null, localControls: null },
  heading: { nodeType: 'heading', rootBlock: true, textMenu: true, blockMenu: 'heading', nodeMenu: null, localControls: null },
  bulletList: { nodeType: 'bulletList', rootBlock: true, textMenu: true, blockMenu: 'bullet-list', nodeMenu: null, localControls: null },
  orderedList: { nodeType: 'orderedList', rootBlock: true, textMenu: true, blockMenu: 'ordered-list', nodeMenu: null, localControls: null },
  taskList: { nodeType: 'taskList', rootBlock: true, textMenu: true, blockMenu: 'task-list', nodeMenu: null, localControls: null },
  blockquote: { nodeType: 'blockquote', rootBlock: true, textMenu: true, blockMenu: 'blockquote', nodeMenu: null, localControls: null },
  codeBlock: { nodeType: 'codeBlock', rootBlock: true, textMenu: false, blockMenu: 'code-block', nodeMenu: null, localControls: 'code' },
  table: { nodeType: 'table', rootBlock: true, textMenu: true, blockMenu: 'table', nodeMenu: null, localControls: 'table' },
  horizontalRule: { nodeType: 'horizontalRule', rootBlock: true, textMenu: false, blockMenu: 'horizontal-rule', nodeMenu: null, localControls: null },
  details: { nodeType: 'details', rootBlock: true, textMenu: true, blockMenu: 'details', nodeMenu: null, localControls: 'details' },
  image: { nodeType: 'image', rootBlock: true, textMenu: false, blockMenu: 'image', nodeMenu: 'image', localControls: 'resize' },
  assetImage: { nodeType: 'assetImage', rootBlock: true, textMenu: false, blockMenu: 'image', nodeMenu: 'asset-image', localControls: 'resize' },
  fileAttachment: { nodeType: 'fileAttachment', rootBlock: true, textMenu: false, blockMenu: 'attachment', nodeMenu: 'attachment', localControls: 'attachment-card' },
  canvasReference: { nodeType: 'canvasReference', rootBlock: true, textMenu: false, blockMenu: 'resource', nodeMenu: 'canvas', localControls: 'resource-preview' },
  mindmapReference: { nodeType: 'mindmapReference', rootBlock: true, textMenu: false, blockMenu: 'resource', nodeMenu: 'mindmap', localControls: 'resource-preview' },
  documentReference: { nodeType: 'documentReference', rootBlock: false, textMenu: false, blockMenu: null, nodeMenu: 'document-reference', localControls: null },
}

export function getInteractionProfile(nodeType: string): InteractionProfile | null {
  return INTERACTION_PROFILES[nodeType] ?? null
}

export function getRootInteractionProfile(nodeType: RootBlockNodeType): InteractionProfile {
  const profile = INTERACTION_PROFILES[nodeType]
  if (!profile?.rootBlock) throw new Error(`Missing root interaction profile for ${nodeType}`)
  return profile
}
