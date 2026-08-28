import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePendingSave } from './usePendingSave'

interface SavePatch {
  title?: string
  content?: { type: 'doc'; content: Array<{ type: string }> }
}

describe('usePendingSave', () => {
  let container: HTMLDivElement
  let root: Root
  let current: ReturnType<typeof usePendingSave<SavePatch>>

  function Harness({ save }: { save: (patch: SavePatch) => Promise<void> }) {
    current = usePendingSave(save, 60_000)
    return null
  }

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it.each([
    ['title then content', [{ title: '新标题' }, { content: { type: 'doc' as const, content: [] } }]],
    ['content then title', [{ content: { type: 'doc' as const, content: [] } }, { title: '新标题' }]],
  ])('merges %s into one native patch', async (_name, patches) => {
    const save = vi.fn(async () => undefined)
    act(() => root.render(<Harness save={save} />))
    act(() => patches.forEach((patch) => current.schedule(patch)))
    await act(async () => { await current.flush() })

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({
      title: '新标题', content: { type: 'doc', content: [] },
    })
    expect(current.pending).toBe(false)
    expect(current.error).toBeNull()
  })

  it('uses the latest save callback when a pending patch is flushed', async () => {
    const first = vi.fn(async () => undefined)
    const latest = vi.fn(async () => undefined)
    act(() => root.render(<Harness save={first} />))
    act(() => current.schedule({ title: '待保存' }))
    act(() => root.render(<Harness save={latest} />))
    await act(async () => { await current.flush() })

    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledWith({ title: '待保存' })
  })

  it('retains a failed draft and saves it on retry', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('磁盘忙'))
      .mockResolvedValueOnce(undefined)
    act(() => root.render(<Harness save={save} />))
    act(() => current.schedule({ title: '不能丢' }))

    let failure: unknown
    await act(async () => {
      try { await current.flush() } catch (error) { failure = error }
    })
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('磁盘忙')
    expect(current.pending).toBe(true)
    expect(current.error?.message).toBe('磁盘忙')

    await act(async () => { await current.retry() })
    expect(save).toHaveBeenNthCalledWith(2, { title: '不能丢' })
    expect(current.pending).toBe(false)
    expect(current.error).toBeNull()
  })
})
