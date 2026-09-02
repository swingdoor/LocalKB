import { normalizeApplicationTheme } from '@shared/application-themes'
import type { ApplicationTheme } from '@shared/types'

export function applyApplicationTheme(value: unknown): ApplicationTheme {
  const theme = normalizeApplicationTheme(value)
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'night')
  return theme
}
