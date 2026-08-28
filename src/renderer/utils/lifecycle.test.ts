import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeChangeEvent } from '@shared/knowledge-types'
import { finishPendingSavesBeforeClose } from './closeWorkflow'
import { isExternalEventForVault, shouldReloadExternalChange } from './knowledgeEventPolicy'

const event: KnowledgeChangeEvent = {
  vaultId: '11111111-1111-4111-8111-111111111111',
  resourceType: 'document',
  resourceId: '22222222-2222-4222-8222-222222222222',
  change: 'updated',
  origin: 'mcp',
  changedAt: '2026-01-01T00:00:00.000Z',
}

describe('editor lifecycle policies', () => {
  it('completes close only after a successful flush', async () => {
    const complete = vi.fn()
    expect(await finishPendingSavesBeforeClose({
      flush: vi.fn(async () => undefined),
      discard: vi.fn(),
      confirmRetry: vi.fn(),
      confirmDiscard: vi.fn(),
      complete,
    })).toBe('closed')
    expect(complete).toHaveBeenCalledOnce()
  })

  it('retries a failed final save and supports explicit discard', async () => {
    const flush = vi.fn()
      .mockRejectedValueOnce(new Error('失败'))
      .mockRejectedValueOnce(new Error('仍失败'))
    const discard = vi.fn()
    const complete = vi.fn()
    expect(await finishPendingSavesBeforeClose({
      flush,
      discard,
      confirmRetry: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false),
      confirmDiscard: vi.fn(() => true),
      complete,
    })).toBe('closed')
    expect(flush).toHaveBeenCalledTimes(2)
    expect(discard).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledOnce()
  })

  it('ignores renderer-origin events and asks only for pending external conflicts', () => {
    expect(isExternalEventForVault(event, event.vaultId)).toBe(true)
    expect(isExternalEventForVault({ ...event, origin: 'renderer' }, event.vaultId)).toBe(false)
    expect(isExternalEventForVault(event, 'another-vault')).toBe(false)
    const confirm = vi.fn(() => false)
    expect(shouldReloadExternalChange(false, confirm)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(shouldReloadExternalChange(true, confirm)).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })
})
