import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import DocumentTree from './DocumentTree'
import { useAppStore } from '../stores/appStore'

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
    createVault,
    renameVault,
    deleteVault,
    switchVault,
    setSettingsOpen,
    setTheme,
  } = useAppStore()

  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false)
  const [isCreatingVault, setIsCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [vaultMenu, setVaultMenu] = useState<{ id: string; left: number; top: number } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [vaultNameDraft, setVaultNameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleCreateVault = () => {
    const name = newVaultName.trim()
    if (!name) return
    void createVault(name)
    setNewVaultName('')
    setIsCreatingVault(false)
  }

  const closeVaultDropdown = () => {
    setIsVaultDropdownOpen(false)
    setVaultMenu(null)
  }

  const handleRenameVault = async () => {
    if (!renameTarget) return
    const name = vaultNameDraft.trim()
    if (!name) return
    if (name === renameTarget.name || await renameVault(renameTarget.id, name)) {
      setRenameTarget(null)
    }
  }

  const menuVault = vaultMenu ? vaults.find((vault) => vault.id === vaultMenu.id) : null

  return (
    <aside
      className="flex h-full w-60 flex-col border-r"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      {/* 保留原有的知识库选择器视觉。 */}
      <div className="border-b p-3" style={{ borderColor: 'var(--border-color)' }}>
        <div className="relative">
          <button
            type="button"
            aria-label="选择知识库"
            aria-expanded={isVaultDropdownOpen}
            aria-haspopup="menu"
            onClick={() => isVaultDropdownOpen ? closeVaultDropdown() : setIsVaultDropdownOpen(true)}
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
                <div key={vault.id}>
                  <div
                    className={`group flex items-center transition-colors hover:bg-selected ${
                      currentVault?.id === vault.id ? 'bg-selected' : ''
                    }`}
                  >
                    <button
                      type="button"
                      title={vault.name}
                      onClick={() => {
                        void switchVault(vault)
                        closeVaultDropdown()
                      }}
                      className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                        currentVault?.id === vault.id ? 'font-medium text-primary' : ''
                      }`}
                    >
                      {vault.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`管理知识库 ${vault.name}`}
                      aria-expanded={vaultMenu?.id === vault.id}
                      aria-haspopup="menu"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (vaultMenu?.id === vault.id) {
                          setVaultMenu(null)
                          return
                        }
                        const rect = event.currentTarget.getBoundingClientRect()
                        setVaultMenu({
                          id: vault.id,
                          left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - 120)),
                          top: Math.max(8, Math.min(rect.top, window.innerHeight - 72)),
                        })
                      }}
                      className="mr-1 flex h-7 w-7 flex-none items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-primary focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-primary group-hover:opacity-100 group-focus-within:opacity-100"
                      title="管理知识库"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
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

        {vaultMenu && menuVault && (
          <div
            role="menu"
            aria-label={`知识库操作 ${menuVault.name}`}
            className="fixed z-20 w-28 rounded border border-border py-1 text-sm shadow-lg"
            style={{
              backgroundColor: 'var(--bg-editor)',
              left: vaultMenu.left,
              top: vaultMenu.top,
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRenameTarget({ id: menuVault.id, name: menuVault.name })
                setVaultNameDraft(menuVault.name)
                setVaultMenu(null)
              }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-selected focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
            >
              <Pencil size={14} />
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setVaultMenu(null)
                setDeleteTarget({ id: menuVault.id, name: menuVault.name })
              }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-red-500 hover:bg-selected focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
            >
              <Trash2 size={14} />
              删除
            </button>
          </div>
        )}

      </div>

      {currentVault ? (
        <DocumentTree />
      ) : (
        <div className="flex-1 py-8 text-center text-sm text-gray-400">请先选择知识库</div>
      )}

      {/* 保留原有主题和设置功能。 */}
      <div className="flex items-center justify-between border-t border-border p-3">
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>设置</span>
        </button>
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

      {isVaultDropdownOpen && <div className="fixed inset-0 z-0" onClick={closeVaultDropdown} />}

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRenameTarget(null)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-vault-title"
            className="w-80 rounded-lg border border-border p-4 shadow-xl"
            style={{ backgroundColor: 'var(--bg-editor)' }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void handleRenameVault()
            }}
          >
            <h3 id="rename-vault-title" className="mb-3 text-base font-medium">重命名知识库</h3>
            <label htmlFor="rename-vault-input" className="mb-1 block text-sm">知识库名称</label>
            <input
              id="rename-vault-input"
              value={vaultNameDraft}
              onChange={(event) => setVaultNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleRenameVault()
                }
                if (event.key === 'Escape') setRenameTarget(null)
              }}
              onFocus={(event) => event.currentTarget.select()}
              className="mb-4 w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenameTarget(null)} className="rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200">取消</button>
              <button type="submit" disabled={!vaultNameDraft.trim()} className="rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">保存</button>
            </div>
          </form>
        </div>
      )}

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
