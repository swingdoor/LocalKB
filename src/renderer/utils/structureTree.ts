import type {
  ContentSummary,
  TreeEntryV2,
  VaultTreeV2,
} from '@shared/knowledge-types'
import type { TreeMoveInput } from '../stores/appStore'

export interface GroupTreeNode {
  kind: 'group'
  id: string
  name: string
  children: StructureTreeNode[]
}

export interface ContentTreeNode {
  kind: 'content'
  id: string
  name: string
  contentType: ContentSummary['contentType']
  summary: ContentSummary
}

export type StructureTreeNode = GroupTreeNode | ContentTreeNode

function orderedChildren(structure: VaultTreeV2, parentId: string | null): TreeEntryV2[] {
  return structure.entries
    .filter((entry) => entry.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export function buildTreeData(
  structure: VaultTreeV2 | null,
  contents: ContentSummary[],
): StructureTreeNode[] {
  if (!structure) return []
  const summaries = new Map(contents.map((content) => [content.id, content]))
  const build = (parentId: string | null): StructureTreeNode[] =>
    orderedChildren(structure, parentId).flatMap((entry): StructureTreeNode[] => {
      if (entry.kind === 'group') {
        return [{ kind: 'group', id: entry.id, name: entry.name, children: build(entry.id) }]
      }
      const summary = summaries.get(entry.id)
      return summary ? [{
        kind: 'content', id: entry.id, name: summary.title,
        contentType: summary.contentType, summary,
      }] : []
    })
  return build(null)
}

export function getAncestorGroupIds(
  structure: VaultTreeV2 | null,
  contentId: string,
): string[] {
  if (!structure) return []
  const byId = new Map(structure.entries.map((entry) => [entry.id, entry]))
  const ancestors: string[] = []
  let current = byId.get(contentId)?.parentId ?? null
  const visited = new Set<string>()
  while (current !== null && !visited.has(current)) {
    visited.add(current)
    const group = byId.get(current)
    if (!group || group.kind !== 'group') break
    ancestors.unshift(group.id)
    current = group.parentId
  }
  return ancestors
}

export function getContentBreadcrumb(
  structure: VaultTreeV2 | null,
  contentId: string,
): string {
  if (!structure) return ''
  const byId = new Map(structure.entries.map((entry) => [entry.id, entry]))
  return getAncestorGroupIds(structure, contentId)
    .map((id) => byId.get(id))
    .filter((entry): entry is Extract<TreeEntryV2, { kind: 'group' }> => entry?.kind === 'group')
    .map((group) => group.name)
    .join(' / ')
}

export function countDescendantContent(
  structure: VaultTreeV2 | null,
  groupId: string,
): number {
  if (!structure) return 0
  const groups = new Set([groupId])
  let changed = true
  while (changed) {
    changed = false
    for (const entry of structure.entries) {
      if (
        entry.kind === 'group' && entry.parentId !== null &&
        groups.has(entry.parentId) && !groups.has(entry.id)
      ) {
        groups.add(entry.id)
        changed = true
      }
    }
  }
  return structure.entries.filter(
    (entry) => entry.kind === 'content' && entry.parentId !== null && groups.has(entry.parentId),
  ).length
}

export function isInvalidMove(
  structure: VaultTreeV2 | null,
  itemId: string,
  targetParentId: string | null,
): boolean {
  if (!structure || targetParentId === null) return false
  const item = structure.entries.find((entry) => entry.id === itemId)
  const target = structure.entries.find((entry) => entry.id === targetParentId)
  if (!item || !target || target.kind !== 'group') return true
  if (item.kind === 'content') return false
  if (item.id === targetParentId) return true
  let parent: string | null = targetParentId
  const visited = new Set<string>()
  while (parent !== null && !visited.has(parent)) {
    if (parent === item.id) return true
    visited.add(parent)
    parent = structure.entries.find(
      (entry) => entry.kind === 'group' && entry.id === parent,
    )?.parentId ?? null
  }
  return false
}

export function applyOptimisticMove(
  structure: VaultTreeV2,
  input: TreeMoveInput,
): VaultTreeV2 {
  const entries = structure.entries.map((entry) => ({ ...entry }))
  const item = entries.find((entry) => entry.id === input.id)
  if (!item) return structure
  const oldParentId = item.parentId
  item.parentId = input.targetParentId
  const reorder = (parentId: string | null, moved?: TreeEntryV2) => {
    const siblings = entries
      .filter((entry) => entry.parentId === parentId && entry.id !== moved?.id)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    if (moved) siblings.splice(Math.min(Math.max(input.index, 0), siblings.length), 0, moved)
    siblings.forEach((entry, order) => { entry.order = order })
  }
  reorder(input.targetParentId, item)
  if (oldParentId !== input.targetParentId) reorder(oldParentId)
  return { schemaVersion: 2, entries }
}
