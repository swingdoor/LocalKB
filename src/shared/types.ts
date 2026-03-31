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
