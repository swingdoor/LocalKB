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
    useAppStore.setState({ hotkeys: [], contents: [] })
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

  it('opens a document with the official drag handle mounted once', () => {
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

    act(() => root.render(
      <Editor
        document={loadedDocument}
        vaultId="33333333-3333-4333-8333-333333333333"
        onUpdate={vi.fn(async () => loadedDocument)}
      />,
    ))

    expect(container.querySelector('.ProseMirror')?.textContent).toContain('文档正文')
    expect(document.body.querySelectorAll('.editor-drag-handle')).toHaveLength(1)
  })
})
