import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../stores/appStore'
import { DocumentReferenceNode, FileAttachmentNode } from './RichDocumentNodes'

describe('rich document node interaction boundaries', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let mountedEditor: Editor | null

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mountedEditor = null
    useAppStore.setState({
      contents: [{
        id: 'target-document',
        contentType: 'document',
        title: '目标文档',
        parentId: null,
        order: 0,
        createdAt: '2026-08-29T00:00:00.000Z',
        updatedAt: '2026-08-29T00:00:00.000Z',
      }],
    })
    window.electronAPI = { knowledge: {
      getAssetMetadata: vi.fn(async () => ({ ok: true, data: {
        id: 'asset-id', fileName: '资料.pdf', extension: 'pdf', mimeType: 'application/pdf',
        size: 1024, sha256: '0'.repeat(64),
        createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z',
      } })),
      openAsset: vi.fn(async () => ({ ok: true })),
      saveAssetAs: vi.fn(async () => ({ ok: true })),
    } } as any
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function TestEditor({ onOpen }: { onOpen: (documentId: string) => void }) {
    const editor = useEditor({
      extensions: [
        StarterKit,
        DocumentReferenceNode.configure({ onOpen }),
        FileAttachmentNode.configure({ vaultId: 'vault' }),
      ],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [
            { type: 'text', text: '参见' },
            { type: 'documentReference', attrs: { documentId: 'target-document', label: '目标文档' } },
          ] },
          { type: 'fileAttachment', attrs: {
            assetId: 'asset-id', displayName: '资料.pdf',
          } },
        ],
      },
      onCreate: ({ editor: createdEditor }) => { mountedEditor = createdEditor },
    })
    return <EditorContent editor={editor} />
  }

  it('selects the exact inline reference on one click and opens it only on double click', async () => {
    const onOpen = vi.fn()
    await act(async () => {
      root.render(<TestEditor onOpen={onOpen} />)
      await Promise.resolve()
      await Promise.resolve()
    })
    const reference = container.querySelector<HTMLElement>('.document-reference')!

    await act(async () => {
      reference.click()
      await Promise.resolve()
    })
    expect(mountedEditor?.state.selection).toBeInstanceOf(NodeSelection)
    expect((mountedEditor?.state.selection as NodeSelection).node.type.name).toBe('documentReference')
    expect(onOpen).not.toHaveBeenCalled()

    await act(async () => {
      reference.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(onOpen).toHaveBeenCalledWith('target-document')
  })

  it('keeps workspace open/save actions on the attachment card', async () => {
    await act(async () => {
      root.render(<TestEditor onOpen={() => undefined} />)
      await Promise.resolve()
      await Promise.resolve()
    })
    const attachment = container.querySelector<HTMLElement>('.file-attachment')!
    await act(async () => {
      attachment.click()
      await Promise.resolve()
    })
    expect((mountedEditor?.state.selection as NodeSelection).node.type.name).toBe('fileAttachment')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title="打开附件"]')!.click()
      await Promise.resolve()
    })
    expect(window.electronAPI.knowledge.openAsset).toHaveBeenCalledWith(
      'vault', 'asset-id', '资料.pdf',
    )

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title="另存为"]')!.click()
      await Promise.resolve()
    })
    expect(window.electronAPI.knowledge.saveAssetAs).toHaveBeenCalledWith(
      'vault', 'asset-id', '资料.pdf',
    )
  })
})
