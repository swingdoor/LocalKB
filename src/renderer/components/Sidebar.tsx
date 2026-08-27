import { useState } from 'react'
import DocumentTree from './DocumentTree'
import { useAppStore } from '../stores/appStore'
import { formatHotkeyDisplay } from '../utils/hotkeys'

const themes = [
  { id: 'white', label: '白色', color: '#FFFFFF', border: '#E2E8F0' },
  { id: 'warm', label: '暖黄', color: '#FCD34D', border: '#F59E0B' },
  { id: 'green', label: '浅绿', color: '#86EFAC', border: '#16A34A' },
]

function Sidebar() {
  const {
    vaults,
    currentVault,
    theme,
    hotkeys,
    createVault,
    deleteVault,
    switchVault,
    setSearchOpen,
    setSettingsOpen,
    setTheme,
  } = useAppStore()
  const searchHotkey = hotkeys.find((hotkey) => hotkey.id === 'search')
  const searchHotkeyDisplay = searchHotkey
    ? formatHotkeyDisplay(searchHotkey)
    : formatHotkeyDisplay({ key: 'k', modifiers: ['ctrl'] })

  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false)
  const [isCreatingVault, setIsCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleCreateVault = () => {
    const name = newVaultName.trim()
    if (!name) return
    void createVault(name)
    setNewVaultName('')
    setIsCreatingVault(false)
  }

  return (
    <aside
      className="flex h-full w-60 flex-col border-r"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      {/* 保留原有的知识库选择器和搜索区视觉。 */}
      <div className="border-b p-3" style={{ borderColor: 'var(--border-color)' }}>
        <div className="relative">
          <button
            onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              borderWidth: '1px',
            }}
          >
            <span className="truncate font-medium">{currentVault?.name || '选择知识库'}</span>
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isVaultDropdownOpen && (
            <div
              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg shadow-lg"
              style={{
                backgroundColor: 'var(--bg-editor)',
                borderColor: 'var(--border-color)',
                borderWidth: '1px',
              }}
            >
              {vaults.map((vault) => (
                <div
                  key={vault.id}
                  className={`group flex items-center transition-colors hover:bg-selected ${
                    currentVault?.id === vault.id ? 'bg-selected' : ''
                  }`}
                >
                  <button
                    onClick={() => {
                      void switchVault(vault)
                      setIsVaultDropdownOpen(false)
                    }}
                    className={`flex-1 px-3 py-2 text-left text-sm ${
                      currentVault?.id === vault.id ? 'font-medium text-primary' : ''
                    }`}
                  >
                    {vault.name}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setDeleteTarget({ id: vault.id, name: vault.name })
                    }}
                    className="mr-1 px-2 py-1 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    title="删除知识库"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}

              {isCreatingVault ? (
                <div className="border-t border-border p-2">
                  <input
                    value={newVaultName}
                    onChange={(event) => setNewVaultName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleCreateVault()
                      if (event.key === 'Escape') setIsCreatingVault(false)
                    }}
                    placeholder="输入知识库名称"
                    className="w-full rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="mt-1 flex gap-1">
                    <button onClick={handleCreateVault} className="flex-1 rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primary-700">创建</button>
                    <button onClick={() => setIsCreatingVault(false)} className="flex-1 rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">取消</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingVault(true)}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-selected"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  新建知识库
                </button>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: 'var(--bg-editor)',
            color: 'var(--text-secondary)',
            borderColor: 'var(--border-color)',
            borderWidth: '1px',
          }}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>搜索...</span>
          <span className="ml-auto text-xs" style={{ color: 'var(--text-secondary)' }}>{searchHotkeyDisplay}</span>
        </button>
      </div>

      {currentVault ? (
        <DocumentTree />
      ) : (
        <div className="flex-1 py-8 text-center text-sm text-gray-400">请先选择知识库</div>
      )}

      {/* 保留原有主题和系统设置区。 */}
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-gray-600">主题</span>
          <div className="flex gap-2">
            {themes.map((item) => (
              <button
                key={item.id}
                onClick={() => void setTheme(item.id)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  theme === item.id ? 'ring-2 ring-primary ring-offset-1' : ''
                }`}
                style={{ backgroundColor: item.color, borderColor: item.border }}
                title={item.label}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>系统设置</span>
        </button>
      </div>

      {isVaultDropdownOpen && <div className="fixed inset-0 z-0" onClick={() => setIsVaultDropdownOpen(false)} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="w-72 rounded-lg bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="mb-2 text-base font-medium">确认删除</h3>
            <p className="mb-4 text-sm text-gray-600">确定删除知识库 “{deleteTarget.name}” 吗？此操作不可恢复。</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  void deleteVault(deleteTarget.id)
                  setIsVaultDropdownOpen(false)
                  setDeleteTarget(null)
                }}
                className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
              >删除</button>
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200">取消</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
