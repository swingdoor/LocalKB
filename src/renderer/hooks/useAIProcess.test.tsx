import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIProcessResult } from '@shared/types'
import { useAIProcess } from './useAIProcess'

describe('useAIProcess', () => {
  let container: HTMLDivElement
  let root: Root
  let resolveProcess: (result: AIProcessResult) => void
  const process = vi.fn(() => new Promise<AIProcessResult>((resolve) => { resolveProcess = resolve }))
  const cancel = vi.fn(async () => true)

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    process.mockClear()
    cancel.mockClear()
    window.electronAPI = { ai: { process, cancel } } as any
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function Harness() {
    const ai = useAIProcess()
    const editor = { state: { selection: { from: 2, to: 5 } } } as any
    return (
      <>
        <button onClick={() => void ai.handleAIProcess('选中文字', 'expand', editor)}>扩写</button>
        <button onClick={ai.cancelProcess}>关闭</button>
        <button onClick={() => ai.beginCustomProcess('选中文字', editor)}>自定义</button>
        <button onClick={() => void ai.submitCustomProcess('改得更简洁')}>执行自定义</button>
        <button onClick={ai.reviseCustomProcess}>重新修改</button>
        <output>{ai.showProcessModal ? ai.processState.phase : '已关闭'}</output>
      </>
    )
  }

  it('aborts an expand request when the loading dialog is closed and ignores its late result', async () => {
    act(() => root.render(<Harness />))
    act(() => container.querySelectorAll('button')[0].click())
    expect(container.querySelector('output')?.textContent).toBe('loading')
    const requestId = process.mock.calls[0][0].requestId

    act(() => container.querySelectorAll('button')[1].click())
    expect(cancel).toHaveBeenCalledWith(requestId)
    expect(container.querySelector('output')?.textContent).toBe('已关闭')

    await act(async () => resolveProcess({ success: true, text: '迟到的结果' }))
    expect(container.querySelector('output')?.textContent).toBe('已关闭')
  })

  it('keeps custom instruction, loading, and result in one process state', async () => {
    act(() => root.render(<Harness />))
    act(() => container.querySelectorAll('button')[2].click())
    expect(container.querySelector('output')?.textContent).toBe('instruction')
    expect(process).not.toHaveBeenCalled()

    act(() => container.querySelectorAll('button')[3].click())
    expect(container.querySelector('output')?.textContent).toBe('loading')
    expect(process).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'custom',
      text: '选中文字',
      instruction: '改得更简洁',
    }))

    await act(async () => resolveProcess({ success: true, text: '简洁结果' }))
    expect(container.querySelector('output')?.textContent).toBe('result')

    act(() => container.querySelectorAll('button')[4].click())
    expect(container.querySelector('output')?.textContent).toBe('instruction')
  })
})
