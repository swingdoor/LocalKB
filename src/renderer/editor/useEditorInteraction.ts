import { useSyncExternalStore } from 'react'
import type { EditorInteractionCoordinator } from './interactionContext'

export function useEditorInteractionPhase(coordinator: EditorInteractionCoordinator) {
  return useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
}
