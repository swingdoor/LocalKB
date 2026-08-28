import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './stores/appStore'

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

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    selectContent.mockClear()
    window.electronAPI = {
      window: {
        onCloseRequested: vi.fn(() => () => undefined),
        completeClose: vi.fn(),
      },
      knowledge: { onChanged: vi.fn(() => () => undefined) },
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
      loadTheme: vi.fn(async () => undefined),
      loadHotkeys: vi.fn(async () => undefined),
      selectContent,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
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
})
