import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoadedDocument } from '@shared/knowledge-types'
import { useAppStore } from '../stores/appStore'
import Editor from './Editor'

describe('Editor runtime mounting', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.setItem('toc-panel-visible', 'true')
    useAppStore.setState({ hotkeys: [], contents: [], showHeadingNumbers: false })
    window.electronAPI = {
      knowledge: {
        onChanged: vi.fn(() => () => undefined),
      },
      file: {},
      ai: {},
    } as any
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('opens a document with the official drag handle and independent shell controls', async () => {
    const loadedDocument: LoadedDocument = {
      id: '11111111-1111-4111-8111-111111111111',
      contentType: 'document',
      title: '测试文档',
      parentId: null,
      order: 0,
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          attrs: { nodeId: '22222222-2222-4222-8222-222222222222' },
          content: [{ type: 'text', text: '文档正文' }],
        }],
      },
    }

    const onUpdate = vi.fn(async () => loadedDocument)
    act(() => root.render(
      <Editor
        document={loadedDocument}
        vaultId="33333333-3333-4333-8333-333333333333"
        onUpdate={onUpdate}
      />,
    ))

    expect(container.querySelector('.ProseMirror')?.textContent).toContain('文档正文')
    expect(document.body.querySelectorAll('.editor-drag-handle')).toHaveLength(1)

    const title = container.querySelector<HTMLInputElement>('input[aria-label="文档标题"]')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(title, '更新后的标题')
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 700)))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: '更新后的标题' }))

    const tocPanel = container.querySelector<HTMLElement>('[aria-label="文档目录"]')!
    expect(tocPanel.style.width).toBe('260px')
    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('目录'))!
      .click())
    expect(tocPanel.style.width).toBe('0px')

    act(() => Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('序号'))!
      .click())
    expect(container.querySelector('.show-heading-numbers')).toBeTruthy()

    const exportTrigger = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('导出'))!
    act(() => exportTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    expect(Array.from(document.body.querySelectorAll('[role="menuitem"]'))
      .some((item) => item.textContent?.includes('导出 PDF'))).toBe(true)
    expect(Array.from(document.body.querySelectorAll('[role="menuitem"]'))
      .some((item) => item.textContent?.includes('导出 Markdown'))).toBe(true)
    expect(document.body.textContent).not.toContain('（有损）')
  })
})
