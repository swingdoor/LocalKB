import type { MindMapSelection } from './mindMapInteraction'

export interface MindMapCapabilities {
  context: 'none' | 'root-node' | 'node' | 'multi-node' | 'arrow' | 'summary'
  canStyle: boolean
  canEditText: boolean
  canAddChild: boolean
  canAddSibling: boolean
  canInsertParent: boolean
  canMoveNode: boolean
  canExpand: boolean
  canFocus: boolean
  canCopy: boolean
  canCut: boolean
  canPaste: boolean
  canDelete: boolean
  canEditMetadata: boolean
  canCreateRelation: boolean
  canCreateSummary: boolean
  canChangeArrow: boolean
  canReconnectArrow: boolean
}

const NONE: MindMapCapabilities = {
  context: 'none', canStyle: false, canEditText: false, canAddChild: false,
  canAddSibling: false, canInsertParent: false, canMoveNode: false, canExpand: false,
  canFocus: false, canCopy: false, canCut: false, canPaste: false, canDelete: false,
  canEditMetadata: false, canCreateRelation: false, canCreateSummary: false,
  canChangeArrow: false, canReconnectArrow: false,
}

export function resolveMindMapCapabilities({
  selection,
  rootId,
  continuousSiblings = false,
  hasClipboard = false,
}: {
  selection: MindMapSelection
  rootId: string | null
  continuousSiblings?: boolean
  hasClipboard?: boolean
}): MindMapCapabilities {
  if (selection.type === 'none') return { ...NONE }
  if (selection.type === 'arrow') {
    return { ...NONE, context: 'arrow', canStyle: true, canEditText: true, canDelete: true, canChangeArrow: true, canReconnectArrow: true }
  }
  if (selection.type === 'summary') {
    return { ...NONE, context: 'summary', canStyle: true, canEditText: true, canDelete: true }
  }

  const ids = selection.ids
  if (ids.length === 0) return { ...NONE }
  const includesRoot = Boolean(rootId && ids.includes(rootId))
  if (ids.length > 1) {
    return {
      ...NONE,
      context: 'multi-node',
      canStyle: true,
      canCopy: !includesRoot,
      canCut: !includesRoot,
      canDelete: !includesRoot,
      canCreateSummary: !includesRoot && continuousSiblings,
    }
  }
  if (includesRoot) {
    return {
      ...NONE,
      context: 'root-node',
      canStyle: true,
      canEditText: true,
      canAddChild: true,
      canExpand: true,
      canPaste: hasClipboard,
      canEditMetadata: true,
      canCreateRelation: true,
    }
  }
  return {
    ...NONE,
    context: 'node',
    canStyle: true,
    canEditText: true,
    canAddChild: true,
    canAddSibling: true,
    canInsertParent: true,
    canMoveNode: true,
    canExpand: true,
    canFocus: true,
    canCopy: true,
    canCut: true,
    canPaste: hasClipboard,
    canDelete: true,
    canEditMetadata: true,
    canCreateRelation: true,
  }
}
