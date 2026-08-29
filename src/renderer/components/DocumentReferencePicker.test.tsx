import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DocumentReferencePicker from './DocumentReferencePicker'

const documents = [
  {
    id: '11111111-1111-4111-8111-111111111111', contentType: 'document' as const,
    title: '技术架构', parentId: null, order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-02',
  },
  {
    id: '22222222-2222-4222-8222-222222222222', contentType: 'document' as const,
    title: '股票', parentId: null, order: 1, createdAt: '2026-01-01', updatedAt: '2026-01-03',
  },
]

describe('DocumentReferencePicker', () => {
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

  it('filters documents and returns the selected document', () => {
    const onSelect = vi.fn()
    act(() => root.render(
      <DocumentReferencePicker
        documents={documents}
        currentDocumentId={documents[0].id}
        onSelect={onSelect}
        onClose={() => undefined}
      />,
    ))

    const input = container.querySelector<HTMLInputElement>('input')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, '技术')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.textContent).toContain('技术架构')
    expect(container.textContent).not.toContain('股票')
    const target = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('技术架构'),
    )!
    act(() => target.click())
    expect(onSelect).toHaveBeenCalledWith(documents[0])
  })
})
