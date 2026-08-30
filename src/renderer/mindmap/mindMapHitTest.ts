import type { ArrowSvg, MindElixirInstance, SummarySvg, Topic } from 'mind-elixir'

export type MindMapHit =
  | { kind: 'floating-control'; element: Element }
  | { kind: 'native-text-editor'; element: Element }
  | { kind: 'arrow-control-handle'; element: Element }
  | { kind: 'node'; element: Topic; id: string }
  | { kind: 'arrow'; element: ArrowSvg; id: string }
  | { kind: 'summary'; element: SummarySvg; id: string }
  | { kind: 'blank'; element: Element }

export function findRenderedMindMapArrow(instance: MindElixirInstance, id: string): ArrowSvg | null {
  return Array.from(instance.arrowSvg.querySelectorAll<ArrowSvg>(':scope > g'))
    .find((candidate) => candidate.arrowObj?.id === id) ?? null
}

export function findRenderedMindMapSummary(instance: MindElixirInstance, id: string): SummarySvg | null {
  return Array.from(instance.summarySvg.querySelectorAll<SummarySvg>(':scope > g'))
    .find((candidate) => candidate.summaryObj?.id === id) ?? null
}

function arrowForTarget(instance: MindElixirInstance, target: Element): ArrowSvg | null {
  const label = target.closest<HTMLElement>('.svg-label[data-type="arrow"]')
  if (label?.dataset.svgId) {
    const id = label.dataset.svgId.replace(/^a-/, '')
    return findRenderedMindMapArrow(instance, id)
  }
  const group = target.closest<ArrowSvg>('.topiclinks > g')
  if (!group || group.parentElement !== instance.arrowSvg || !group.arrowObj?.id) return null
  return instance.arrows.some((arrow) => arrow.id === group.arrowObj.id) ? group : null
}

function summaryForTarget(instance: MindElixirInstance, target: Element): SummarySvg | null {
  const label = target.closest<HTMLElement>('.svg-label[data-type="summary"]')
  if (label?.dataset.svgId) {
    const id = label.dataset.svgId.replace(/^s-/, '')
    return findRenderedMindMapSummary(instance, id)
  }
  const group = target.closest<SummarySvg>('.summary > g')
  if (!group || group.parentElement !== instance.summarySvg || !group.summaryObj?.id) return null
  return instance.summaries.some((summary) => summary.id === group.summaryObj.id) ? group : null
}

export function classifyMindMapHit(instance: MindElixirInstance, rawTarget: EventTarget | null): MindMapHit | null {
  if (!(rawTarget instanceof Element)) return null
  const floating = rawTarget.closest('[data-mindmap-floating-control]')
  if (floating) return { kind: 'floating-control', element: floating }
  const editor = rawTarget.closest('#input-box,input,textarea,[contenteditable="true"]')
  if (editor) return { kind: 'native-text-editor', element: editor }
  const handle = rawTarget.closest('.circle,.linkcontroller')
  if (handle) return { kind: 'arrow-control-handle', element: handle }
  const topic = rawTarget.closest('me-tpc') as Topic | null
  if (topic?.nodeObj?.id) return { kind: 'node', element: topic, id: topic.nodeObj.id }
  const arrow = arrowForTarget(instance, rawTarget)
  if (arrow) return { kind: 'arrow', element: arrow, id: arrow.arrowObj.id }
  const summary = summaryForTarget(instance, rawTarget)
  if (summary) return { kind: 'summary', element: summary, id: summary.summaryObj.id }
  return { kind: 'blank', element: rawTarget }
}
