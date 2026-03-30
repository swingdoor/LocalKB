import React, { useState } from 'react'
import type { Vault, Document } from '../App'

interface SidebarProps {
  vaults: Vault[]
  currentVault: Vault | null
  documents: Document[]
  currentDocument: Document | null
  onCreateVault: (name: string) => void
  onSwitchVault: (vault: Vault) => void
  onCreateDocument: (type: 'document' | 'drawing') => void
  onSelectDocument: (doc: Document) => void
  onDeleteDocument: (docId: string) => void
  onOpenSearch: () => void
}

function Sidebar({
  vaults,
  currentVault,
  documents,
  currentDocument,
  onCreateVault,
  onSwitchVault,
  onCreateDocument,
  onSelectDocument,
  onDeleteDocument,
  onOpenSearch,
}: SidebarProps) {
  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false)
  const [isCreatingVault, setIsCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [contextMenuDoc, setContextMenuDoc] = useState<Document | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })

  const handleCreateVault = () => {
    if (newVaultName.trim()) {
      onCreateVault(newVaultName.trim())
      setNewVaultName('')
      setIsCreatingVault(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, doc: Document) => {
    e.preventDefault()
    setContextMenuDoc(doc)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => {
    setContextMenuDoc(null)
  }

  return (
    <aside className="w-60 h-full bg-sidebar border-r border-border flex flex-col">
      {/* Vault 选择器 */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <button
            onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="truncate font-medium">
              {currentVault?.name || '选择知识库'}
            </span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Vault 下拉菜单 */}
          {isVaultDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
              {vaults.map(vault => (
                <button
                  key={vault.id}
                  onClick={() => {
                    onSwitchVault(vault)
                    setIsVaultDropdownOpen(false)
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-selected transition-colors ${
                    currentVault?.id === vault.id ? 'bg-selected text-primary font-medium' : ''
                  }`}
                >
                  {vault.name}
                </button>
              ))}
              
              {/* 创建新 Vault */}
              {isCreatingVault ? (
                <div className="p-2 border-t border-border">
                  <input
                    type="text"
                    value={newVaultName}
                    onChange={(e) => setNewVaultName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateVault()
                      if (e.key === 'Escape') setIsCreatingVault(false)
                    }}
                    placeholder="输入知识库名称"
                    className="w-full px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={handleCreateVault}
                      className="flex-1 px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary-700"
                    >
                      创建
                    </button>
                    <button
                      onClick={() => setIsCreatingVault(false)}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingVault(true)}
                  className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-selected border-t border-border flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  新建知识库
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* 搜索按钮 */}
        <button
          onClick={onOpenSearch}
          className="w-full mt-2 flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>搜索...</span>
          <span className="ml-auto text-xs text-gray-400">Ctrl+K</span>
        </button>
      </div>
      
      {/* 新建按钮 */}
      {currentVault && (
        <div className="p-3 flex gap-2">
          <button
            onClick={() => onCreateDocument('document')}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            文档
          </button>
          <button
            onClick={() => onCreateDocument('drawing')}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm border border-primary text-primary rounded-lg hover:bg-selected transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            画布
          </button>
        </div>
      )}
      
      {/* 文档列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {documents.length > 0 ? (
          <div className="space-y-1">
            {documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                onContextMenu={(e) => handleContextMenu(e, doc)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  currentDocument?.id === doc.id
                    ? 'bg-selected text-primary'
                    : 'hover:bg-gray-100'
                }`}
              >
                {doc.type === 'drawing' ? (
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span className="truncate">{doc.title}</span>
              </button>
            ))}
          </div>
        ) : currentVault ? (
          <div className="text-center text-gray-400 text-sm py-8">
            暂无文档
          </div>
        ) : (
          <div className="text-center text-gray-400 text-sm py-8">
            请先选择知识库
          </div>
        )}
      </div>
      
      {/* 右键菜单 */}
      {contextMenuDoc && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-32"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button
              onClick={() => {
                onDeleteDocument(contextMenuDoc.id)
                closeContextMenu()
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50"
            >
              删除
            </button>
          </div>
        </>
      )}
      
      {/* 点击外部关闭 Vault 下拉 */}
      {isVaultDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsVaultDropdownOpen(false)}
        />
      )}
    </aside>
  )
}

export default Sidebar
