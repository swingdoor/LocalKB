import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './stores/appStore'
import { registerPendingSaveFlusher } from './utils/pendingSaveCoordinator'
import type { KnowledgeChangeEvent } from '@shared/knowledge-types'

vi.mock('./components/TitleBar', () => ({ default: () => null }))
vi.mock('./components/Sidebar', () => ({ default: () => <aside>导航</aside> }))
vi.mock('./components/Editor', () => ({ default: () => <div>编辑器</div> }))
vi.mock('./components/ExcalidrawCanvas', () => ({ default: () => <div>画布</div> }))
vi.mock('./components/SearchModal', () => ({ default: () => null }))
vi.mock('./components/SettingsModal', () => ({ default: () => null }))
vi.mock('./utils/loadFonts', () => ({ loadXiaolaiFont: vi.fn() }))

import App from './App'

const selection = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contentType: 'document' as const,
  title: '项目产品架构图',
}

describe('content workspace state', () => {
  let container: HTMLDivElement
  let root: Root
  const selectContent = vi.fn(async () => undefined)
  const loadContents = vi.fn(async () => undefined)
  const completeClose = vi.fn()
  let closeRequested: (() => void) | undefined
  let knowledgeChanged: ((event: KnowledgeChangeEvent) => void) | undefined
  const unregisterPendingControllers: Array<() => void> = []

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    selectContent.mockClear()
    loadContents.mockClear()
    completeClose.mockClear()
    closeRequested = undefined
    knowledgeChanged = undefined
    window.electronAPI = {
      window: {
        onCloseRequested: vi.fn((callback: () => void) => {
          closeRequested = callback
          return () => undefined
        }),
        completeClose,
      },
      knowledge: {
        onChanged: vi.fn((callback: (event: KnowledgeChangeEvent) => void) => {
          knowledgeChanged = callback
          return () => undefined
        }),
      },
    } as any
    useAppStore.setState({
      currentVault: { schemaVersion: 2, id: 'vault', name: '知识库', createdAt: '' },
      selectedContent: selection,
      currentContent: null,
      contentLoading: false,
      contentError: 'TipTap 节点类型不受支持',
      sidebarOpen: true,
      hotkeys: [],
      isSearchOpen: false,
      isSettingsOpen: false,
      loadVaults: vi.fn(async () => undefined),
      loadHotkeys: vi.fn(async () => undefined),
      selectContent,
      loadContents,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    unregisterPendingControllers.splice(0).forEach((unregister) => unregister())
    container.remove()
  })

  it('renders content failures in the workspace and retries the selection', async () => {
    act(() => root.render(<App />))

    expect(container.textContent).toContain('无法打开“项目产品架构图”')
    expect(container.textContent).toContain('TipTap 节点类型不受支持')
    expect(container.querySelector('aside')?.textContent).toBe('导航')

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('重试'))!
        .click()
    })
    expect(selectContent).toHaveBeenCalledWith(selection)
  })

  it('shows loading and both lightweight empty states in the main workspace', () => {
    useAppStore.setState({ contentLoading: true, contentError: null })
    act(() => root.render(<App />))
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('项目产品架构图')

    act(() => useAppStore.setState({
        contentLoading: false,
        selectedContent: null,
        currentContent: null,
        currentVault: { schemaVersion: 2, id: 'vault', name: '知识库', createdAt: '' },
      }))
    expect(container.textContent).toContain('选择或创建一个文档开始编辑')

    act(() => useAppStore.setState({ currentVault: null }))
    expect(container.textContent).toContain('请先创建一个知识库')
  })

  it('keeps close confirmation continuations sequential and completes only after retry succeeds', async () => {
    const flush = vi.fn()
      .mockRejectedValueOnce(new Error('第一次保存失败'))
      .mockResolvedValueOnce(undefined)
    unregisterPendingControllers.push(registerPendingSaveFlusher(flush, () => true))
    act(() => root.render(<App />))

    await act(async () => closeRequested?.())
    expect(document.body.textContent).toContain('最后一次保存没有成功')

    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '重试保存')!
        .click()
      await Promise.resolve()
    })
    expect(flush).toHaveBeenCalledTimes(2)
    expect(completeClose).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain('最后一次保存没有成功')
  })

  it('cancels or explicitly discards after a failed close save', async () => {
    const discard = vi.fn()
    unregisterPendingControllers.push(registerPendingSaveFlusher(
      vi.fn(async () => { throw new Error('保存失败') }),
      () => true,
      discard,
    ))
    act(() => root.render(<App />))

    await act(async () => closeRequested?.())
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '不重试')!
        .click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('尚未保存的更改将永久丢失')
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '继续编辑')!
        .click()
      await Promise.resolve()
    })
    expect(completeClose).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()

    await act(async () => closeRequested?.())
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '不重试')!
        .click()
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '放弃并退出')!
        .click()
      await Promise.resolve()
    })
    expect(discard).toHaveBeenCalledOnce()
    expect(completeClose).toHaveBeenCalledOnce()
  })

  it('retains or reloads local content after an external update according to the dialog choice', async () => {
    const discard = vi.fn()
    unregisterPendingControllers.push(registerPendingSaveFlusher(
      vi.fn(async () => undefined),
      () => true,
      discard,
    ))
    act(() => root.render(<App />))
    const event: KnowledgeChangeEvent = {
      vaultId: 'vault',
      resourceType: 'document',
      resourceId: selection.id,
      change: 'updated',
      origin: 'mcp',
      changedAt: '2026-08-29T00:00:00.000Z',
    }

    await act(async () => knowledgeChanged?.(event))
    expect(document.body.textContent).toContain('内容已在外部更新')
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '保留当前编辑')!
        .click()
      await Promise.resolve()
    })
    expect(selectContent).not.toHaveBeenCalled()

    await act(async () => knowledgeChanged?.(event))
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === '重新加载')!
        .click()
      await Promise.resolve()
    })
    expect(discard).toHaveBeenCalledOnce()
    expect(selectContent).toHaveBeenCalledWith(selection)
    expect(loadContents).toHaveBeenCalledWith('vault')
  })
})
