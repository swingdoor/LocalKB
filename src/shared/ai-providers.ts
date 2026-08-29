import type { AIProviderId } from './types'

export interface AIModelOption {
  value: string
  label: string
}

export interface AIProviderConfig {
  id: AIProviderId
  name: string
  baseUrl: string
  models: readonly AIModelOption[]
}

export const AI_PROVIDERS: readonly AIProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { value: 'glm-5.2', label: 'GLM-5.2' },
      { value: 'glm-5-turbo', label: 'GLM-5 Turbo' },
    ],
  },
  {
    id: 'bailian',
    name: '百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { value: 'qwen3.8-flash', label: 'Qwen3.8 Flash' },
      { value: 'qwen3.8-max', label: 'Qwen3.8 Max' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    models: [
      { value: 'MiniMax-M2.7', label: 'MiniMax M2.7' },
      { value: 'MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 Highspeed' },
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    models: [],
  },
]

export function getAIProvider(providerId: AIProviderId): AIProviderConfig {
  return AI_PROVIDERS.find((provider) => provider.id === providerId) ?? AI_PROVIDERS[0]
}

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === 'string' && AI_PROVIDERS.some((provider) => provider.id === value)
}

export function getAIBaseUrl(providerId: AIProviderId, customBaseUrl = ''): string {
  return (providerId === 'custom' ? customBaseUrl : getAIProvider(providerId).baseUrl)
    .trim()
    .replace(/\/+$/, '')
}
