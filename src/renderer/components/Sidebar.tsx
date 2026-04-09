import React, { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import type { Document } from '@shared/types'

const themes = [
  { id: 'white', label: '白色', color: '#FFFFFF', border: '#E2E8F0' },
  { id: 'warm', label: '暖黄', color: '#FCD34D', border: '#F59E0B' },
  { id: 'green', label: '浅绿', color: '#86EFAC', border: '#16A34A' },
]

function Sidebar() {
  // 从 store 获取状态和 actions
  const {
    vaults,
    currentVault,
    documents,
    currentDocument,
    theme,
    hotkeys,
    createVault,
    deleteVault,
    switchVault,
    createDocument,
    selectDocument,
    deleteDocument,
    setSearchOpen,
    setSettingsOpen,
    setTheme,
  } = useAppStore()

  // 获取搜索快捷键显示文本
  const searchHotkey = hotkeys.find(h => h.id === 'search')
  const searchHotkeyDisplay = searchHotkey?.display || 'Ctrl+K'

  // 本地 UI 状态
  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false)
  const [isCreatingVault, setIsCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [contextMenuDoc, setContextMenuDoc] = useState<Document | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })

  const handleCreateVault = () => {
    if (newVaultName.trim()) {
      createVault(newVaultName.trim())
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
    <aside className="w-60 h-full border-r flex flex-col" style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}>
      {/* Vault 选择器 */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="relative">
          <button
            onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', borderWidth: '1px' }}
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
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-editor)', borderColor: 'var(--border-color)', borderWidth: '1px' }}
            >
              {vaults.map(vault => (
                <div
                  key={vault.id}
                  className={`flex items-center group hover:bg-selected transition-colors ${
                    currentVault?.id === vault.id ? 'bg-selected' : ''
                  }`}
                >
                  <button
                    onClick={() => {
                      switchVault(vault)
                      setIsVaultDropdownOpen(false)
                    }}
                    className={`flex-1 px-3 py-2 text-left text-sm ${
                      currentVault?.id === vault.id ? 'text-primary font-medium' : ''
                    }`}
                  >
                    {vault.name}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`确定删除知识库"${vault.name}"吗？此操作不可恢复。`)) {
                        deleteVault(vault.id)
                      }
                    }}
                    className="px-2 py-1 mr-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除知识库"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
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
          onClick={() => setSearchOpen(true)}
          className="w-full mt-2 flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--bg-editor)', color: 'var(--text-secondary)', borderColor: 'var(--border-color)', borderWidth: '1px' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>搜索...</span>
          <span className="ml-auto text-xs" style={{ color: 'var(--text-secondary)' }}>{searchHotkeyDisplay}</span>
        </button>
      </div>
      
      {/* 新建按钮 */}
      {currentVault && (
        <div className="p-3 flex gap-2">
          <button
            onClick={() => createDocument(undefined, 'document')}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--primary-color)', color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            文档
          </button>
          <button
            onClick={() => createDocument(undefined, 'drawing')}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors"
            style={{ borderWidth: '1px', borderColor: 'var(--primary-color)', color: 'var(--primary-color)', backgroundColor: 'transparent' }}
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
                onClick={() => selectDocument(doc)}
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

      {/* 底部设置按钮 */}
      <div className="p-3 border-t border-border space-y-2">
        {/* 主题切换 */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-gray-600">主题</span>
          <div className="flex gap-2">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  theme === t.id ? 'ring-2 ring-primary ring-offset-1' : ''
                }`}
                style={{ backgroundColor: t.color, borderColor: t.border }}
                title={t.label}
              />
            ))}
          </div>
        </div>
        
        {/* 系统设置按钮 */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>系统设置</span>
        </button>
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
                deleteDocument(contextMenuDoc.id)
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
