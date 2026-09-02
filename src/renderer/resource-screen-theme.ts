import { normalizeApplicationTheme } from '@shared/application-themes'
import type { ApplicationTheme } from '@shared/types'

export interface ResourceScreenTheme {
  id: ApplicationTheme
  excalidrawAppearance: 'light' | 'dark'
  canvasSurface: string
  mindMapSurface: string
}

const RESOURCE_SCREEN_THEMES: Record<ApplicationTheme, ResourceScreenTheme> = {
  classic: {
    id: 'classic',
    excalidrawAppearance: 'light',
    canvasSurface: 'var(--resource-canvas-surface)',
    mindMapSurface: 'var(--resource-mindmap-surface)',
  },
  paper: {
    id: 'paper',
    excalidrawAppearance: 'light',
    canvasSurface: 'var(--resource-canvas-surface)',
    mindMapSurface: 'var(--resource-mindmap-surface)',
  },
  night: {
    id: 'night',
    excalidrawAppearance: 'dark',
    canvasSurface: 'var(--resource-canvas-surface)',
    mindMapSurface: 'var(--resource-mindmap-surface)',
  },
}

export function getResourceScreenTheme(value: unknown): ResourceScreenTheme {
  return RESOURCE_SCREEN_THEMES[normalizeApplicationTheme(value)]
}

export function preserveExcalidrawContentTheme(
  screenAppState: Record<string, unknown>,
  persistedAppState: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...screenAppState }
  if (persistedAppState && Object.prototype.hasOwnProperty.call(persistedAppState, 'theme')) {
    next.theme = persistedAppState.theme
  } else {
    delete next.theme
  }
  return next
}
