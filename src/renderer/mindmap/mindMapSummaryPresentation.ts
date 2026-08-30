import type { MindElixirInstance, SummarySvg } from 'mind-elixir'

const SUMMARY_GAP_PX = 14

function branchDirection(instance: MindElixirInstance, summary: SummarySvg): 'left' | 'right' | 'down' {
  if (instance.direction === 3) return 'down'
  const parent = instance.findEle(summary.summaryObj.parent)
  const branchTopic = parent.nodeObj.parent
    ? parent
    : instance.findEle(parent.nodeObj.children?.[summary.summaryObj.start]?.id ?? parent.nodeObj.id)
  return branchTopic.closest('me-main')?.classList.contains('lhs') ? 'left' : 'right'
}

export function syncMindMapSummaryPresentation(
  instance: MindElixirInstance,
  selectedSummaryId: string | null,
): void {
  if (!instance.summarySvg) return
  for (const summary of Array.from(instance.summarySvg.querySelectorAll<SummarySvg>(':scope > g'))) {
    try {
      const direction = branchDirection(instance, summary)
      const x = direction === 'left' ? -SUMMARY_GAP_PX : direction === 'right' ? SUMMARY_GAP_PX : 0
      const y = direction === 'down' ? SUMMARY_GAP_PX : 0
      const transform = `translate(${x}px, ${y}px)`
      summary.style.transform = transform
      if (summary.labelEl) summary.labelEl.style.transform = transform
      const selected = summary.summaryObj.id === selectedSummaryId
      summary.toggleAttribute('data-mindmap-summary-selected', selected)
      summary.labelEl?.toggleAttribute('data-mindmap-summary-selected', selected)
    } catch {
      // A stale summary is removed by Mind Elixir on the next native render.
    }
  }
}
