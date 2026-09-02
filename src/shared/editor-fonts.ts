import type { EditorFontId, GeneralSettings } from './types'

export interface EditorFontOption {
  id: EditorFontId
  label: string
  fontFamily: string
}

export const EDITOR_FONT_OPTIONS: readonly EditorFontOption[] = [
  {
    id: 'system',
    label: '系统默认',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'kaiti',
    label: '楷体',
    fontFamily: 'KaiTi, STKaiti, serif',
  },
  {
    id: 'xiaolai',
    label: '手写体',
    fontFamily: 'Xiaolai, cursive',
  },
] as const

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  editorFont: 'system',
  applicationTheme: 'classic',
}

export function isEditorFontId(value: unknown): value is EditorFontId {
  return EDITOR_FONT_OPTIONS.some((option) => option.id === value)
}

export function getEditorFont(id: EditorFontId): EditorFontOption {
  return EDITOR_FONT_OPTIONS.find((option) => option.id === id) ?? EDITOR_FONT_OPTIONS[0]
}
