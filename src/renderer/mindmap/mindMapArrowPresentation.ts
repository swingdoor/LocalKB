import type { ArrowSvg, MindElixirInstance } from 'mind-elixir'

export function syncMindMapArrowPresentation(
  instance: MindElixirInstance,
  selectedArrowId: string | null,
): void {
  if (!instance.arrowSvg) return
  // Mind Elixir inserts a nested `.arrow-highlight <g>` after selection.
  // Only direct children are arrow objects; nested groups are presentation.
  for (const arrow of Array.from(instance.arrowSvg.querySelectorAll<ArrowSvg>(':scope > g'))) {
    const selected = arrow.arrowObj?.id === selectedArrowId
    arrow.toggleAttribute('data-mindmap-arrow-selected', selected)
    arrow.labelEl?.toggleAttribute('data-mindmap-arrow-selected', selected)
  }
}
