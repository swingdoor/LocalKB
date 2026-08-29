import { describe, expect, it } from 'vitest'
import { getAIBaseUrl } from './ai-providers'

describe('AI provider endpoints', () => {
  it.each([
    ['deepseek', 'https://api.deepseek.com/v1'],
    ['zhipu', 'https://open.bigmodel.cn/api/paas/v4'],
    ['bailian', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
    ['minimax', 'https://api.minimaxi.com/v1'],
  ] as const)('builds the %s OpenAI-compatible endpoint', (provider, expected) => {
    expect(getAIBaseUrl(provider)).toBe(expected)
  })

  it('uses and normalizes the custom Base URL', () => {
    expect(getAIBaseUrl('custom', ' https://example.com/openai/v1/ '))
      .toBe('https://example.com/openai/v1')
    expect(getAIBaseUrl('custom')).toBe('')
  })
})
