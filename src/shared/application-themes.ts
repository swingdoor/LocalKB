import type { ApplicationTheme } from './types'

export interface ApplicationThemeDefinition {
  id: ApplicationTheme
  label: string
  description: string
  appearance: 'light' | 'dark'
  preview: {
    background: string
    foreground: string
    sidebar: string
    accent: string
  }
  window: {
    background: string
    symbol: string
  }
}

export const DEFAULT_APPLICATION_THEME: ApplicationTheme = 'classic'

export const APPLICATION_THEMES: readonly ApplicationThemeDefinition[] = [
  {
    id: 'classic',
    label: '经典',
    description: '清晰克制的中性浅色',
    appearance: 'light',
    preview: {
      background: '#FFFFFF', foreground: '#0A0A0A', sidebar: '#FAFAFA', accent: '#F5F5F5',
    },
    window: { background: '#FFFFFF', symbol: '#333333' },
  },
  {
    id: 'paper',
    label: '纸张',
    description: '温和舒适的暖色纸面',
    appearance: 'light',
    preview: {
      background: '#FBF8F3', foreground: '#1F1B17', sidebar: '#F5F0E8', accent: '#EDE6DB',
    },
    window: { background: '#FBF8F3', symbol: '#3F3831' },
  },
  {
    id: 'night',
    label: '夜间',
    description: '低眩光的深色工作区',
    appearance: 'dark',
    preview: {
      background: '#18181B', foreground: '#FAFAFA', sidebar: '#111113', accent: '#27272A',
    },
    window: { background: '#18181B', symbol: '#FAFAFA' },
  },
] as const

export function isApplicationTheme(value: unknown): value is ApplicationTheme {
  return value === 'classic' || value === 'paper' || value === 'night'
}

export function normalizeApplicationTheme(value: unknown): ApplicationTheme {
  return isApplicationTheme(value) ? value : DEFAULT_APPLICATION_THEME
}

export function getApplicationTheme(value: unknown): ApplicationThemeDefinition {
  const normalized = normalizeApplicationTheme(value)
  return APPLICATION_THEMES.find((theme) => theme.id === normalized) ?? APPLICATION_THEMES[0]
}
