import OpenAI from 'openai'
import type { AISettings } from '../shared/types'
import { getAIBaseUrl } from '../shared/ai-providers'

const AI_REQUEST_TIMEOUT_MS = 60_000

export async function generateAIText(
  settings: AISettings,
  input: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = settings.apiKey.trim()
  const model = settings.model.trim()
  const baseURL = getAIBaseUrl(settings.provider, settings.baseUrl)

  if (!apiKey) throw new Error('请先配置 API Key')
  if (!model) throw new Error('请先配置模型 ID')
  if (!baseURL) throw new Error('请先配置 Base URL')

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: AI_REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  })
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: input }],
    stream: false,
  }, { signal })
  const text = completion.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('AI 返回结果为空')
  return text
}

export function describeAIError(error: unknown, fallback: string): string {
  if (
    (error instanceof Error && error.name === 'AbortError')
    || (error instanceof OpenAI.APIUserAbortError)
  ) {
    return '操作已取消'
  }
  if (error instanceof OpenAI.APIError) {
    return `模型服务请求失败（${error.status}）：${error.message}`
  }
  return error instanceof Error && error.message ? error.message : fallback
}
