import type {
  Arrow, MindElixirInstance, NodeObj, Summary, SummaryStyle, SummarySvg, Topic,
} from 'mind-elixir'
import {
  findMindMapTopic, reshapeMindMapArrow, restoreMindMapSummarySelection,
} from './mindElixirAdapter'

export type MindMapNodeInsertion = 'child' | 'sibling-before' | 'sibling-after' | 'parent'

export interface RelationTargetMode {
  sourceId: string
  bidirectional: boolean
}

export function mergeNodeStylePatch(
  node: NodeObj,
  stylePatch: Partial<NonNullable<NodeObj['style']>>,
): Partial<NodeObj> {
  return { style: { ...(node.style ?? {}), ...stylePatch } }
}

export function resolveRelationTarget(mode: RelationTargetMode | null, targetId: string) {
  if (!mode || mode.sourceId === targetId) return null
  return { fromId: mode.sourceId, toId: targetId, bidirectional: mode.bidirectional }
}

export function isContinuousSiblingSelection(topics: Topic[]): boolean {
  if (topics.length < 2) return false
  const parent = topics[0].nodeObj.parent
  if (!parent?.children || topics.some((topic) => topic.nodeObj.parent?.id !== parent.id)) return false
  const indices = topics.map((topic) => parent.children!.findIndex((child) => child.id === topic.nodeObj.id)).sort((a, b) => a - b)
  return indices.every((index, position) => index >= 0 && (position === 0 || index === indices[position - 1] + 1))
}

export function updateMindMapSummaryStyle(
  instance: MindElixirInstance,
  summaryId: string,
  stylePatch: Partial<SummaryStyle>,
): SummarySvg | null {
  const summary = instance.summaries.find((candidate) => candidate.id === summaryId)
  if (!summary) return null
  summary.style = { ...(summary.style ?? {}), ...stylePatch }
  instance.linkDiv()
  const rendered = Array.from(instance.summarySvg.querySelectorAll<SummarySvg>(':scope > g'))
    .find((candidate) => candidate.summaryObj?.id === summaryId) ?? null
  if (rendered) instance.selectSummary(rendered)
  instance.bus.fire('operation', { name: 'finishEditSummary', obj: summary })
  return rendered
}

/**
 * Delegates one complete insertion action to Mind Elixir around an explicit
 * target. Omitting the optional NodeObj is intentional: the engine owns ID
 * generation, structural insertion, selection, and native inline editing as
 * one atomic operation.
 */
export async function insertMindMapNodeAndEdit(
  instance: MindElixirInstance,
  target: Topic,
  insertion: MindMapNodeInsertion,
): Promise<Topic> {
  if (insertion === 'child') await instance.addChild(target)
  else if (insertion === 'sibling-before') await instance.insertSibling('before', target)
  else if (insertion === 'sibling-after') await instance.insertSibling('after', target)
  else await instance.insertParent(target)

  const created = instance.currentNode
  if (!created || created === target) throw new Error('新节点创建后无法定位')
  return created
}

export function resolveMindMapTopics(instance: MindElixirInstance, nodeIds: readonly string[]): Topic[] | null {
  const uniqueIds = [...new Set(nodeIds)]
  const topics = uniqueIds.map((id) => findMindMapTopic(instance, id))
  return topics.some((topic) => !topic) ? null : topics as Topic[]
}

export async function insertMindMapNodeById(
  instance: MindElixirInstance,
  targetId: string,
  insertion: MindMapNodeInsertion,
): Promise<Topic | null> {
  const target = findMindMapTopic(instance, targetId)
  if (!target || (insertion !== 'child' && target.nodeObj.id === instance.nodeData.id)) return null
  return insertMindMapNodeAndEdit(instance, target, insertion)
}

export async function editMindMapNodeById(instance: MindElixirInstance, targetId: string): Promise<boolean> {
  const target = findMindMapTopic(instance, targetId)
  if (!target) return false
  instance.selectNode(target)
  await instance.beginEdit(target)
  return true
}

export async function moveMindMapNodeById(
  instance: MindElixirInstance,
  targetId: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const target = findMindMapTopic(instance, targetId)
  if (!target?.nodeObj.parent) return false
  if (direction === 'up') await instance.moveUpNode(target)
  else await instance.moveDownNode(target)
  return true
}

export function setMindMapNodeExpandedById(
  instance: MindElixirInstance,
  targetId: string,
  expanded: boolean,
): boolean {
  const target = findMindMapTopic(instance, targetId)
  if (!target) return false
  instance.expandNode(target, expanded)
  return true
}

export async function removeMindMapNodesById(
  instance: MindElixirInstance,
  nodeIds: readonly string[],
): Promise<boolean> {
  const topics = resolveMindMapTopics(instance, nodeIds)
  if (!topics?.length || topics.some((topic) => topic.nodeObj.id === instance.nodeData.id)) return false
  await instance.removeNodes(topics)
  return true
}

export async function updateMindMapNodesById(
  instance: MindElixirInstance,
  nodeIds: readonly string[],
  createPatch: (node: NodeObj) => Partial<NodeObj>,
): Promise<boolean> {
  const topics = resolveMindMapTopics(instance, nodeIds)
  if (!topics?.length) return false
  for (const topic of topics) await instance.reshapeNode(topic, createPatch(topic.nodeObj))
  return true
}

export async function copyMindMapNodesById(
  instance: MindElixirInstance,
  sourceIds: readonly string[],
  targetId: string,
): Promise<boolean> {
  const sources = resolveMindMapTopics(instance, sourceIds)
  const target = findMindMapTopic(instance, targetId)
  if (!sources?.length || !target || sources.some((topic) => topic.nodeObj.id === instance.nodeData.id)) return false
  const sourceIdsSet = new Set(sources.map((topic) => topic.nodeObj.id))
  let targetAncestor: NodeObj | undefined = target.nodeObj
  while (targetAncestor) {
    if (sourceIdsSet.has(targetAncestor.id)) return false
    targetAncestor = targetAncestor.parent
  }
  await instance.copyNodes(sources, target)
  return true
}

export function findMindMapArrow(instance: MindElixirInstance, arrowId: string): Arrow | null {
  return instance.arrows.find((arrow) => arrow.id === arrowId) ?? null
}

export function findMindMapSummary(instance: MindElixirInstance, summaryId: string): Summary | null {
  return instance.summaries.find((summary) => summary.id === summaryId) ?? null
}

export function createMindMapRelation(
  instance: MindElixirInstance,
  fromId: string,
  toId: string,
  bidirectional: boolean,
): Arrow | null {
  if (fromId === toId || !findMindMapTopic(instance, fromId) || !findMindMapTopic(instance, toId)) return null
  const existing = new Set(instance.arrows.map((arrow) => arrow.id))
  instance.createArrowFrom({ label: '关联', from: fromId, to: toId, bidirectional })
  const arrow = instance.arrows.find((candidate) => !existing.has(candidate.id)) ?? null
  return arrow
}

export function updateMindMapArrowById(
  instance: MindElixirInstance,
  arrowId: string,
  patch: Partial<Arrow>,
): Arrow | null {
  const arrow = findMindMapArrow(instance, arrowId)
  if (!arrow) return null
  if (patch.from && patch.to && patch.from === patch.to) return null
  if (patch.from && (!findMindMapTopic(instance, patch.from) || patch.from === (patch.to ?? arrow.to))) return null
  if (patch.to && (!findMindMapTopic(instance, patch.to) || patch.to === (patch.from ?? arrow.from))) return null
  reshapeMindMapArrow(instance, arrow, patch, true)
  return arrow
}

export function removeMindMapArrowById(instance: MindElixirInstance, arrowId: string): boolean {
  const rendered = Array.from(instance.arrowSvg.querySelectorAll<any>(':scope > g'))
    .find((candidate) => candidate.arrowObj?.id === arrowId)
  if (!rendered) return false
  instance.removeArrow(rendered)
  if (instance.currentArrow?.arrowObj.id === arrowId) instance.unselectArrow()
  return true
}

export function createMindMapSummaryByIds(instance: MindElixirInstance, nodeIds: readonly string[]): Summary | null {
  const topics = resolveMindMapTopics(instance, nodeIds)
  if (!topics || !isContinuousSiblingSelection(topics)) return null
  const parent = topics[0].nodeObj.parent!
  const indices = topics
    .map((topic) => parent.children!.findIndex((child) => child.id === topic.nodeObj.id))
    .sort((left, right) => left - right)
  const existing = new Set(instance.summaries.map((summary) => summary.id))
  instance.clearSelection()
  instance.createSummaryFrom({
    label: '概要',
    parent: parent.id,
    start: indices[0],
    end: indices[indices.length - 1],
  })
  const summary = instance.summaries.find((candidate) => !existing.has(candidate.id)) ?? null
  if (summary) {
    const rendered = restoreMindMapSummarySelection(instance, summary.id)
    if (rendered) instance.editSummary(rendered)
  }
  return summary
}

export function removeMindMapSummaryById(instance: MindElixirInstance, summaryId: string): boolean {
  if (!findMindMapSummary(instance, summaryId)) return false
  instance.removeSummary(summaryId)
  if (instance.currentSummary?.summaryObj.id === summaryId) instance.unselectSummary()
  return true
}
