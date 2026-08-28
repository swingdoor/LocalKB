import { AlertCircle, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ExcalidrawCanvas from './components/ExcalidrawCanvas'
import SearchModal from './components/SearchModal'
import SettingsModal from './components/SettingsModal'
import { useAppStore } from './stores/appStore'
import { loadXiaolaiFont } from './utils/loadFonts'
import { eventMatchesHotkey, formatHotkeyDisplay } from './utils/hotkeys'
import type { SearchHit } from '@shared/knowledge-types'
import {
  discardPendingSaves,
  flushPendingSaves,
  hasPendingSaves,
} from './utils/pendingSaveCoordinator'
import { finishPendingSavesBeforeClose } from './utils/closeWorkflow'
import { isExternalEventForVault, shouldReloadExternalChange } from './utils/knowledgeEventPolicy'

function App() {
  const {
    currentVault,
    selectedContent,
    contentLoading,
    contentError,
    currentContent,
    isSearchOpen,
    isSettingsOpen,
    sidebarOpen,
    hotkeys,
    loadVaults,
    loadTheme,
    loadHotkeys,
    selectContent,
    revealContent,
    updateDocument,
    replaceCanvas,
    setSearchOpen,
    setSettingsOpen,
  } = useAppStore()

  // 初始化
  useEffect(() => {
    loadVaults()
    loadTheme()
    loadHotkeys()
    loadXiaolaiFont()
  }, [])

  useEffect(() => {
    let handlingClose = false
    return window.electronAPI.window.onCloseRequested(() => {
      if (handlingClose) return
      handlingClose = true
      void finishPendingSavesBeforeClose({
        flush: flushPendingSaves,
        discard: discardPendingSaves,
        confirmRetry: () => window.confirm(
          '最后一次保存失败。点击“确定”重试，点击“取消”选择是否放弃更改。',
        ),
        confirmDiscard: () => window.confirm(
          '确定放弃尚未保存的更改并退出吗？此操作无法撤销。',
        ),
        complete: window.electronAPI.window.completeClose,
      }).finally(() => {
          handlingClose = false
      })
    })
  }, [])

  useEffect(() => window.electronAPI.knowledge.onChanged((event) => {
    const state = useAppStore.getState()
    if (!isExternalEventForVault(event, state.currentVault?.id)) return
    const selected = state.selectedContent
    const affectsOpenContent = selected?.id === event.resourceId && (
      event.resourceType === 'document' || event.resourceType === 'canvas'
    )
    if (affectsOpenContent) {
      if (!shouldReloadExternalChange(hasPendingSaves(), () => window.confirm(
          '当前内容已被外部工具更新。点击“确定”放弃本地未保存更改并重新加载；点击“取消”保留当前编辑。',
        ))) return
      discardPendingSaves()
      if (event.change === 'deleted') {
        useAppStore.setState({
          selectedContent: null, currentContent: null,
          contentLoading: false, contentError: null,
        })
      } else if (selected) {
        useAppStore.setState({ currentContent: null, contentLoading: true, contentError: null })
        void state.selectContent(selected)
      }
    }
    if (event.resourceType === 'tree' || event.resourceType === 'document' ||
        event.resourceType === 'canvas') {
      void state.loadContents(event.vaultId)
    }
  }), [])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 遍历保存的快捷键配置
      for (const hotkey of hotkeys) {
        if (!hotkey.readonly && eventMatchesHotkey(e, hotkey)) {
          e.preventDefault()
          
          // 根据 hotkey.id 执行对应操作
          switch (hotkey.id) {
            case 'search':
              setSearchOpen(true)
              break
            case 'imageCommand':
              // TODO: 图片命令
              break
            case 'canvasCommand':
              // TODO: 画布命令
              break
          }
          break
        }
      }
      
      // Escape 关闭搜索
      if (e.key === 'Escape' && isSearchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hotkeys, isSearchOpen, setSearchOpen])

  // 搜索选择文档
  const handleSearchSelect = (content: SearchHit) => {
    revealContent(content.id)
    void selectContent(content)
    setSearchOpen(false)
  }
  const searchHotkey = hotkeys.find(h => h.id === 'search')
  const searchHotkeyDisplay = searchHotkey ? formatHotkeyDisplay(searchHotkey) : formatHotkeyDisplay({ key: 'k', modifiers: ['ctrl'] })

  return (
    <div 
      className="flex flex-col h-screen" 
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && <Sidebar />}
        <main className="flex-1 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {contentLoading && !currentContent ? (
            <div className="grid h-full place-items-center" role="status">
              <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                正在加载“{selectedContent?.title}”…
              </div>
            </div>
          ) : contentError && !currentContent ? (
            <div className="grid h-full place-items-center px-8">
              <div className="max-w-lg text-center">
                <AlertCircle className="mx-auto mb-4 text-red-500" size={30} strokeWidth={1.7} />
                <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                  无法打开“{selectedContent?.title || '所选内容'}”
                </h2>
                <p className="mt-2 break-words text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                  {contentError}
                </p>
                {selectedContent && (
                  <button
                    type="button"
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    onClick={() => void selectContent(selectedContent)}
                  >
                    <RotateCcw size={15} />
                    重试
                  </button>
                )}
              </div>
            </div>
          ) : currentContent ? (
            currentContent.contentType === 'canvas' ? (
              <ExcalidrawCanvas
                key={currentContent.id}
                canvas={currentContent}
                onUpdate={replaceCanvas}
              />
            ) : (
              <Editor
                key={currentContent.id}
                document={currentContent}
                vaultId={currentVault?.id || ''}
                onUpdate={updateDocument}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              {currentVault ? (
                <div className="text-center">
                  <p className="text-lg mb-2">选择或创建一个文档开始编辑</p>
                  <p className="text-sm">按 {searchHotkeyDisplay} 快速搜索</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg mb-2">欢迎使用 LocalKB</p>
                  <p className="text-sm">请先创建一个知识库</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      
      {/* 搜索模态框 */}
      {isSearchOpen && currentVault && (
        <SearchModal
          vaultId={currentVault.id}
          onSelect={handleSearchSelect}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* AI 设置模态框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

export default App
