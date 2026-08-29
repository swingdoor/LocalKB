// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AISettings } from '../shared/types'
import { generateAIText } from './ai-service'

const baseSettings: AISettings = {
  provider: 'custom',
  apiKey: 'test-key',
  baseUrl: '',
  model: 'test-model',
  polishPrompt: '',
  expandPrompt: '',
}

describe('AI service', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('calls an OpenAI-compatible provider through the official SDK', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit): Promise<Response> => new Response(JSON.stringify({
          id: 'completion-1',
          object: 'chat.completion',
          created: 0,
          model: 'test-model',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '  完成  ' } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const text = await generateAIText({
      ...baseSettings,
      baseUrl: 'https://example.com/v1/',
    }, '测试内容', controller.signal)

    const [request, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(text).toBe('完成')
    expect(String(request)).toBe('https://example.com/v1/chat/completions')
    expect(headers.get('authorization')).toBe('Bearer test-key')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    controller.abort()
    expect(init?.signal?.aborted).toBe(true)
    expect(body).toMatchObject({ model: 'test-model', stream: false })
  })

  it('rejects incomplete custom provider settings before sending a request', async () => {
    await expect(generateAIText({ ...baseSettings, apiKey: '' }, '测试')).rejects.toThrow('请先配置 API Key')
    await expect(generateAIText({ ...baseSettings, model: '' }, '测试')).rejects.toThrow('请先配置模型 ID')
    await expect(generateAIText(baseSettings, '测试')).rejects.toThrow('请先配置 Base URL')
  })
})
