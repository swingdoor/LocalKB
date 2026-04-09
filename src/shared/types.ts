/**
 * 共享类型定义
 * 统一管理 main、preload、renderer 进程间共享的类型
 */

/**
 * 文档类型
 */
export interface Document {
  id: string
  title: string
  content: string
  type: 'document' | 'drawing'
  createdAt: string
  updatedAt: string
}

/**
 * Hotkey configuration
 */
export interface HotkeyConfig {
  id: string           // 'search', 'imageCommand', 'canvasCommand', 'mindmapCommand', 'heading1'
  name: string         // Function name (Chinese)
  key: string          // Key value, e.g., 'k'
  modifiers: string[]  // ['ctrl', 'shift', 'alt'] etc.
  display: string      // Display text, e.g., 'Ctrl+K'
  readonly?: boolean   // Built-in read-only hotkey (cannot be modified)
}

/**
 * Default hotkeys
 */
export const DEFAULT_HOTKEYS: HotkeyConfig[] = [
  // 可修改的快捷键
  { id: 'search', name: '打开搜索', key: 'k', modifiers: ['ctrl'], display: 'Ctrl+K' },
  { id: 'imageCommand', name: '图片命令', key: 'i', modifiers: ['ctrl', 'shift'], display: 'Ctrl+Shift+I' },
  { id: 'canvasCommand', name: '画布命令', key: 'p', modifiers: ['ctrl', 'shift'], display: 'Ctrl+Shift+P' },
  { id: 'mindmapCommand', name: '思维导图', key: 'm', modifiers: ['ctrl', 'shift'], display: 'Ctrl+Shift+M' },
  // 内置只读快捷键 (tiptap StarterKit)
  { id: 'heading1', name: '标题 1', key: '1', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+1', readonly: true },
  { id: 'heading2', name: '标题 2', key: '2', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+2', readonly: true },
  { id: 'heading3', name: '标题 3', key: '3', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+3', readonly: true },
  { id: 'heading4', name: '标题 4', key: '4', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+4', readonly: true },
  { id: 'heading5', name: '标题 5', key: '5', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+5', readonly: true },
  { id: 'heading6', name: '标题 6', key: '6', modifiers: ['ctrl', 'alt'], display: 'Ctrl+Alt+6', readonly: true },
]

/**
 * 知识库类型
 */
export interface Vault {
  id: string
  name: string
  createdAt: string
}

/**
 * 知识库元数据
 */
export interface VaultMeta {
  vault: Vault
  documents: string[] // 文档 ID 列表
}

/**
 * 图片文件信息
 */
export interface ImageFile {
  path: string
  name: string
  data: string
}

/**
 * AI 设置
 */
export interface AISettings {
  apiKey: string
  baseUrl: string
  model: string
  polishPrompt: string
  expandPrompt: string
}

/**
 * AI 处理结果（润色/扩写）
 */
export interface PolishResult {
  success: boolean
  text?: string
  error?: string
}
