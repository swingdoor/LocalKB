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
import type { DocumentSummary } from '@shared/types'

function App() {
  const {
    currentVault,
    currentDocument,
    isSearchOpen,
    isSettingsOpen,
    sidebarOpen,
    hotkeys,
    loadVaults,
    loadTheme,
    loadHotkeys,
    selectDocument,
    revealDocument,
    updateDocument,
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
  const handleSearchSelect = (doc: DocumentSummary) => {
    revealDocument(doc.id)
    void selectDocument(doc)
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
          {currentDocument ? (
            currentDocument.type === 'drawing' ? (
              <ExcalidrawCanvas
                key={currentDocument.id}
                document={currentDocument}
                onUpdate={updateDocument}
              />
            ) : (
              <Editor
                key={currentDocument.id}
                document={currentDocument}
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
