import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ExcalidrawCanvas from './components/ExcalidrawCanvas'
import SearchModal from './components/SearchModal'

export interface Document {
  id: string
  title: string
  content: string
  type: 'document' | 'drawing'
  createdAt: string
  updatedAt: string
}

export interface Vault {
  id: string
  name: string
  createdAt: string
}

function App() {
  const [vaults, setVaults] = useState<Vault[]>([])
  const [currentVault, setCurrentVault] = useState<Vault | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // 加载 Vaults
  const loadVaults = useCallback(async () => {
    const vaultList = await window.electronAPI.vault.list()
    setVaults(vaultList)
    if (vaultList.length > 0 && !currentVault) {
      setCurrentVault(vaultList[0])
    }
  }, [currentVault])

  // 加载文档列表
  const loadDocuments = useCallback(async () => {
    if (!currentVault) {
      setDocuments([])
      return
    }
    const docList = await window.electronAPI.document.list(currentVault.id)
    setDocuments(docList)
  }, [currentVault])

  // 初始化
  useEffect(() => {
    loadVaults()
  }, [])

  // 当前 Vault 变化时加载文档
  useEffect(() => {
    loadDocuments()
    setCurrentDocument(null)
  }, [currentVault, loadDocuments])

  // 创建 Vault
  const handleCreateVault = async (name: string) => {
    const vault = await window.electronAPI.vault.create(name)
    setVaults(prev => [vault, ...prev])
    setCurrentVault(vault)
  }

  // 删除 Vault
  const handleDeleteVault = async (vaultId: string) => {
    await window.electronAPI.vault.delete(vaultId)
    setVaults(prev => prev.filter(v => v.id !== vaultId))
    // 如果删除的是当前选中的知识库，切换到其他知识库
    if (currentVault?.id === vaultId) {
      const remaining = vaults.filter(v => v.id !== vaultId)
      setCurrentVault(remaining.length > 0 ? remaining[0] : null)
    }
  }

  // 切换 Vault
  const handleSwitchVault = (vault: Vault) => {
    setCurrentVault(vault)
  }

  // 创建文档
  const handleCreateDocument = async (type: 'document' | 'drawing' = 'document') => {
    if (!currentVault) return
    const title = type === 'document' ? '新建文档' : '新建画布'
    const doc = await window.electronAPI.document.create(currentVault.id, title, type)
    setDocuments(prev => [doc, ...prev])
    setCurrentDocument(doc)
  }

  // 选择文档
  const handleSelectDocument = async (doc: Document) => {
    if (!currentVault) return
    const fullDoc = await window.electronAPI.document.get(currentVault.id, doc.id)
    if (fullDoc) {
      setCurrentDocument(fullDoc)
    }
  }

  // 更新文档
  const handleUpdateDocument = async (data: { title?: string; content?: string }) => {
    if (!currentVault || !currentDocument) return
    const updated = await window.electronAPI.document.update(
      currentVault.id,
      currentDocument.id,
      data
    )
    if (updated) {
      setCurrentDocument(updated)
      setDocuments(prev =>
        prev.map(d => (d.id === updated.id ? { ...d, ...updated } : d))
      )
    }
  }

  // 删除文档
  const handleDeleteDocument = async (docId: string) => {
    if (!currentVault) return
    const success = await window.electronAPI.document.delete(currentVault.id, docId)
    if (success) {
      setDocuments(prev => prev.filter(d => d.id !== docId))
      if (currentDocument?.id === docId) {
        setCurrentDocument(null)
      }
    }
  }

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K 打开搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
      // Escape 关闭搜索
      if (e.key === 'Escape') {
        setIsSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 搜索选择文档
  const handleSearchSelect = (doc: Document) => {
    handleSelectDocument(doc)
    setIsSearchOpen(false)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          vaults={vaults}
          currentVault={currentVault}
          documents={documents}
          currentDocument={currentDocument}
          onCreateVault={handleCreateVault}
          onDeleteVault={handleDeleteVault}
          onSwitchVault={handleSwitchVault}
          onCreateDocument={handleCreateDocument}
          onSelectDocument={handleSelectDocument}
          onDeleteDocument={handleDeleteDocument}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
        <main className="flex-1 overflow-hidden">
          {currentDocument ? (
            currentDocument.type === 'drawing' ? (
              <ExcalidrawCanvas
                key={currentDocument.id}
                document={currentDocument}
                onUpdate={handleUpdateDocument}
              />
            ) : (
              <Editor
                key={currentDocument.id}
                document={currentDocument}
                vaultId={currentVault?.id || ''}
                onUpdate={handleUpdateDocument}
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
          onClose={() => setIsSearchOpen(false)}
        />
      )}
    </div>
  )
}

export default App
