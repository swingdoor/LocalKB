import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AIProcessModal from './AIProcessModal'

describe('AIProcessModal', () => {
  let container: HTMLDivElement
  let root: Root

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

  const baseProps = {
    isOpen: true,
    mode: 'custom' as const,
    originalText: '选中的原文',
    processedText: '',
    onSubmitInstruction: vi.fn(),
    onReviseInstruction: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onOpenSettings: vi.fn(),
  }

  it('uses one dialog for custom instruction, loading, and result while keeping the original visible', () => {
    act(() => root.render(<AIProcessModal {...baseProps} phase="instruction" />))
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.body.textContent).toContain('选中的原文')
    expect(document.body.querySelector('[aria-label="自定义修改指令"]')).not.toBeNull()

    act(() => root.render(<AIProcessModal {...baseProps} phase="loading" />))
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.body.textContent).toContain('选中的原文')
    expect(document.body.textContent).toContain('AI 正在按指令修改')

    act(() => root.render(
      <AIProcessModal {...baseProps} phase="result" processedText="修改后的结果" />,
    ))
    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.body.textContent).toContain('选中的原文')
    expect(document.body.textContent).toContain('修改后的结果')
    expect(Array.from(document.body.querySelectorAll('button'))
      .some((button) => button.textContent === '替换原文')).toBe(true)
    expect(Array.from(document.body.querySelectorAll('button'))
      .some((button) => button.textContent === '重新修改')).toBe(true)
  })
})
