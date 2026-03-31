import { useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ExcalidrawCanvas from './components/ExcalidrawCanvas'
import SearchModal from './components/SearchModal'
import SettingsModal from './components/SettingsModal'
import { useAppStore } from './stores/appStore'
import type { Document } from '@shared/types'

function App() {
  const {
    currentVault,
    currentDocument,
    isSearchOpen,
    isSettingsOpen,
    loadVaults,
    loadTheme,
    selectDocument,
    updateDocument,
    setSearchOpen,
    setSettingsOpen,
  } = useAppStore()

  // 初始化
  useEffect(() => {
    loadVaults()
    loadTheme()
  }, [])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K 打开搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // Escape 关闭搜索
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSearchOpen])

  // 搜索选择文档
  const handleSearchSelect = (doc: Document) => {
    selectDocument(doc)
    setSearchOpen(false)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
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
                  <p className="text-sm">按 Ctrl+K 快速搜索</p>
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
