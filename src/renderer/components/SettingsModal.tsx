import { useState, useEffect, useCallback, useRef } from 'react'
import type { AISettings, HotkeyConfig } from '@shared/types'
import type { McpStatus, PublicMcpSettings } from '@shared/mcp-types'
import { DEFAULT_HOTKEYS } from '@shared/types'
import { useAppStore } from '../stores/appStore'
import { formatHotkeyDisplay, getModifiersFromEvent, hasSameHotkey } from '../utils/hotkeys'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'ai' | 'hotkey' | 'mcp'

// 自定义下拉组件
interface CustomSelectProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}

function CustomSelect({ value, options, onChange, className = '' }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-8 px-3 py-2 pr-8 text-sm border rounded text-left focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {selectedOption?.label || '请选择'}
      </button>
      <svg 
        className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 border rounded shadow-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full px-3 py-2.5 text-sm text-left hover:bg-primary/10 transition-colors first:rounded-t last:rounded-b ${
                option.value === value ? 'bg-primary/5 text-primary' : ''
              }`}
              style={{ color: option.value === value ? 'var(--primary-color)' : 'var(--text-primary)', borderColor: 'var(--border-color)' }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 模型提供商配置
const modelProviders = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
]

const deepseekModels = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat (将于 2026/07/24 弃用)' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (将于 2026/07/24 弃用)' },
]

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ai')
  
  // AI 设置状态
  const [aiSettings, setAiSettings] = useState<AISettings>({
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    polishPrompt: '请对以下文本进行润色，使其更加流畅、专业，同时保持原意不变。只返回润色后的文本，不要添加任何解释或说明：\n\n',
    expandPrompt: '请对以下文本进行扩写，丰富内容细节，增加相关论述，使其更加完整充实。只返回扩写后的文本，不要添加任何解释或说明：\n\n',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [aiPromptTab, setAiPromptTab] = useState<'polish' | 'expand'>('polish')
  
  // 快捷键状态
  const [hotkeys, setHotkeys] = useState<HotkeyConfig[]>([])
  const [editingHotkeyId, setEditingHotkeyId] = useState<string | null>(null)
  const [hotkeyConflict, setHotkeyConflict] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [mcpSettings, setMcpSettings] = useState<PublicMcpSettings>({
    enabled: false, port: 17890, maskedToken: '',
  })
  const [mcpStatus, setMcpStatus] = useState<McpStatus>({
    state: 'disabled', port: 0, endpoint: '',
  })
  const [mcpUrl, setMcpUrl] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpNotice, setMcpNotice] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadAllSettings()
    }
  }, [isOpen])

  const loadAllSettings = async () => {
    try {
      const [ai, hks, mcp, status, url] = await Promise.all([
        window.electronAPI.settings.getAI(),
        window.electronAPI.settings.getHotkeys(),
        window.electronAPI.settings.getMcp(),
        window.electronAPI.settings.getMcpStatus(),
        window.electronAPI.settings.getMcpUrl(),
      ])
      setAiSettings(ai)
      setHotkeys(hks)
      setMcpSettings(mcp)
      setMcpStatus(status)
      setMcpUrl(url)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)
    try {
      await Promise.all([
        window.electronAPI.settings.saveAI(aiSettings),
        // 只保存可修改的快捷键（排除只读的 heading1-6）
        window.electronAPI.settings.saveHotkeys(hotkeys.filter(h => !h.readonly)),
      ])
      
      // 更新 store 中的配置（使用完整配置，包含只读的 heading1-6）
      const { updateHotkeys } = useAppStore.getState()
      updateHotkeys(hotkeys)
      
      setSaveMessage('保存成功')
      setTimeout(onClose, 500)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSaveMessage('保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMcpToggle = async (enabled: boolean) => {
    setMcpBusy(true)
    setMcpNotice(null)
    try {
      setMcpSettings(await window.electronAPI.settings.saveMcp(enabled))
      setMcpStatus(await window.electronAPI.settings.getMcpStatus())
      setMcpNotice(enabled ? '服务已启动' : '服务已停止')
    } catch (error) {
      console.error('Failed to update MCP service:', error)
      setMcpStatus(await window.electronAPI.settings.getMcpStatus())
      setMcpNotice('服务状态更新失败')
    } finally {
      setMcpBusy(false)
    }
  }

  const handleMcpRefresh = async () => {
    if (!window.confirm('刷新后，之前复制的 MCP 地址会立即失效。确认刷新？')) return
    setMcpBusy(true)
    setMcpNotice(null)
    try {
      setMcpSettings(await window.electronAPI.settings.resetMcpToken())
      setMcpUrl(await window.electronAPI.settings.getMcpUrl())
      setMcpStatus(await window.electronAPI.settings.getMcpStatus())
      setMcpNotice('连接地址已刷新')
    } catch (error) {
      console.error('Failed to refresh MCP URL:', error)
      setMcpNotice('连接地址刷新失败')
    } finally {
      setMcpBusy(false)
    }
  }

  const handleMcpCopy = async () => {
    await window.electronAPI.settings.copyMcpUrl()
    setMcpNotice('连接地址已复制')
  }

  // 快捷键冲突检测
  const checkHotkeyConflict = useCallback((hotkey: HotkeyConfig, excludeId?: string): string | null => {
    for (const hk of hotkeys) {
      if (hk.id === excludeId) continue
      if (hasSameHotkey(hk, hotkey)) {
        return hk.name
      }
    }
    return null
  }, [hotkeys])

  // 监听键盘输入修改快捷键
  const handleHotkeyKeyDown = useCallback((e: React.KeyboardEvent, hotkeyId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    const hotkey = hotkeys.find(h => h.id === hotkeyId)
    if (!hotkey) return

    if (e.key === 'Escape') {
      setEditingHotkeyId(null)
      setHotkeyConflict(null)
      return
    }

    const modifiers = getModifiersFromEvent(e)

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return
    }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

    const newHotkey: HotkeyConfig = {
      ...hotkey,
      key,
      modifiers,
      display: formatHotkeyDisplay({ key, modifiers }),
    }

    const conflict = checkHotkeyConflict(newHotkey, hotkeyId)
    if (conflict) {
      setHotkeyConflict(conflict)
      return
    }

    setHotkeys(hotkeys.map(h => h.id === hotkeyId ? newHotkey : h))
    setEditingHotkeyId(null)
    setHotkeyConflict(null)
  }, [hotkeys, checkHotkeyConflict])

  const startEditHotkey = (hotkeyId: string) => {
    setEditingHotkeyId(hotkeyId)
    setHotkeyConflict(null)
  }

  const cancelEditHotkey = () => {
    setEditingHotkeyId(null)
    setHotkeyConflict(null)
  }

  const handleProviderChange = (providerId: string) => {
    const provider = modelProviders.find(p => p.id === providerId)
    if (provider) {
      setAiSettings({
        ...aiSettings,
        baseUrl: provider.baseUrl,
        model: providerId === 'deepseek' ? 'deepseek-v4-flash' : '',
      })
    }
  }

  const getCurrentModels = () => {
    if (aiSettings.baseUrl.includes('deepseek')) {
      return deepseekModels
    }
    return []
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'var(--overlay-bg)' }}>
      <div 
        className="rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col" 
        style={{ height: '520px', backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', borderWidth: '1px' }}
      >
        {/* 标签页导航 */}
        <div className="flex items-center justify-between px-6 py-3" style={{ borderColor: 'var(--border-color)', borderBottomWidth: '1px' }}>
          <div className="flex gap-1">
            {[
              { key: 'ai' as TabType, label: 'AI 设置' },
              { key: 'hotkey' as TabType, label: '快捷键' },
              { key: 'mcp' as TabType, label: 'MCP 服务' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-gray-100'
                }`}
                style={{ color: activeTab === tab.key ? 'var(--primary-color, #3B82F6)' : 'var(--text-secondary, #6B7280)' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-12 py-5">
          {/* AI 设置标签页 */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {/* API Key */}
              <div className="flex items-center gap-4">
                <span className="w-24 text-sm" style={{ color: 'var(--text-secondary)' }}>Key</span>
                <div className="relative flex-1 max-w-sm">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={aiSettings.apiKey}
                    onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                    placeholder="API Key"
                    className="w-full h-8 px-3 py-2 pr-8 text-sm border rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 模型提供商 */}
              <div className="flex items-center gap-4">
                <span className="w-24 text-sm" style={{ color: 'var(--text-secondary)' }}>厂商</span>
                <CustomSelect
                  value={aiSettings.baseUrl.includes('deepseek') ? 'deepseek' : ''}
                  options={modelProviders.map(p => ({ value: p.id, label: p.name }))}
                  onChange={handleProviderChange}
                  className="flex-1 max-w-sm"
                />
              </div>
              {/* 模型 */}
              <div className="flex items-center gap-4">
                <span className="w-24 text-sm" style={{ color: 'var(--text-secondary)' }}>模型</span>
                <CustomSelect
                  value={aiSettings.model}
                  options={getCurrentModels()}
                  onChange={(value) => setAiSettings({ ...aiSettings, model: value })}
                  className="flex-1 max-w-sm"
                />
              </div>

              {/* 提示词 */}
              <div>
                <div className="flex items-center gap-4 mb-2">
                  <span className="w-24 text-sm" style={{ color: 'var(--text-secondary)' }}>提示词</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAiPromptTab('polish')}
                      className="text-sm px-3 py-1 rounded transition-colors"
                      style={{ backgroundColor: aiPromptTab === 'polish' ? 'var(--primary-color)' : 'transparent', color: aiPromptTab === 'polish' ? '#fff' : 'var(--text-secondary)' }}
                    >
                      润色
                    </button>
                    <button
                      onClick={() => setAiPromptTab('expand')}
                      className="text-sm px-3 py-1 rounded transition-colors"
                      style={{ backgroundColor: aiPromptTab === 'expand' ? 'var(--primary-color)' : 'transparent', color: aiPromptTab === 'expand' ? '#fff' : 'var(--text-secondary)' }}
                    >
                      扩写
                    </button>
                  </div>
                </div>
                <div className="ml-28">
                  <textarea
                    value={aiPromptTab === 'polish' ? aiSettings.polishPrompt : aiSettings.expandPrompt}
                    onChange={(e) => setAiSettings({ 
                      ...aiSettings, 
                      [aiPromptTab === 'polish' ? 'polishPrompt' : 'expandPrompt']: e.target.value 
                    })}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mcp' && (
            <div className="w-full">
              <div className="flex items-center justify-between gap-6 py-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      本地 MCP 服务
                    </h2>
                    <span
                      className="h-2 w-2 rounded-full transition-colors duration-200"
                      style={{
                        backgroundColor: mcpStatus.state === 'running'
                          ? 'var(--success-color, #22C55E)'
                          : mcpStatus.state === 'error'
                            ? 'var(--error-color, #EF4444)'
                            : '#A3A3A3',
                      }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {{ disabled: '已停止', starting: '启动中', running: '运行中', error: '启动失败' }[mcpStatus.state]}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                    仅本机 Agent 可访问，极简笔记退出后服务停止
                  </p>
                  {mcpStatus.error && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--error-color, #EF4444)' }}>
                      {mcpStatus.error}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-label="启用本地 MCP 服务"
                  aria-checked={mcpSettings.enabled}
                  aria-busy={mcpBusy}
                  disabled={mcpBusy}
                  onClick={() => void handleMcpToggle(!mcpSettings.enabled)}
                  className="relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: mcpSettings.enabled ? 'var(--primary-color)' : 'var(--bg-secondary)',
                    borderColor: mcpSettings.enabled ? 'var(--primary-color)' : 'var(--border-color)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      mcpSettings.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-5 pt-5" style={{ borderColor: 'var(--border-color)', borderTopWidth: '1px' }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>连接地址</h3>
                  <button
                    type="button"
                    aria-label="刷新 MCP 连接地址"
                    disabled={mcpBusy}
                    onClick={() => void handleMcpRefresh()}
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors hover:bg-black/5 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <svg className={`h-4 w-4 ${mcpBusy ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 11a8.1 8.1 0 00-15.5-2M4 4v5h5m-5 4a8.1 8.1 0 0015.5 2M20 20v-5h-5" />
                    </svg>
                    刷新地址
                  </button>
                </div>

                <div className="relative">
                  <input
                    aria-label="MCP 连接地址"
                    readOnly
                    value={mcpUrl}
                    className="h-9 w-full rounded border bg-transparent px-3 pr-10 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    aria-label="复制 MCP 连接地址"
                    onClick={() => void handleMcpCopy()}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 transition-colors hover:bg-black/5 focus:outline-none focus:ring-1 focus:ring-primary"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {mcpNotice === '连接地址已复制' ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="11" height="11" rx="2" strokeWidth="2" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
                    地址包含访问 token。除非主动刷新，否则启停或重启应用后地址保持不变。
                  </p>
                  {mcpNotice && (
                    <span className="shrink-0 text-xs" style={{ color: mcpNotice.includes('失败') ? 'var(--error-color, #EF4444)' : 'var(--success-color, #22C55E)' }}>
                      {mcpNotice}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 快捷键设置标签页 */}
          {activeTab === 'hotkey' && (
            <div className="space-y-4">
              {hotkeys.filter(h => h.id !== 'commandMenu').map((hotkey) => (
                <div key={hotkey.id} className="flex items-center gap-4">
                  <span className="w-24 text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{hotkey.name}</span>
                  
                  {editingHotkeyId === hotkey.id ? (
                    <div className="flex items-center gap-2">
                      <span 
                        className="px-3 py-1 text-sm border rounded font-mono w-28 text-center"
                        style={{ backgroundColor: 'var(--primary-color)', color: '#fff', borderColor: 'var(--primary-color)' }}
                        onKeyDown={(e) => handleHotkeyKeyDown(e, hotkey.id)}
                        tabIndex={0}
                      >
                        ...
                      </span>
                      <button
                        onClick={cancelEditHotkey}
                        className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        title="取消"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 text-sm rounded font-mono w-28 text-center"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {formatHotkeyDisplay(hotkey)}
                      </span>
                      {!hotkey.readonly && (
                        <>
                          <button
                            onClick={() => startEditHotkey(hotkey.id)}
                            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="修改快捷键"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              const defaultHk = DEFAULT_HOTKEYS.find(d => d.id === hotkey.id)
                              if (defaultHk) {
                                setHotkeys(hotkeys.map(h => h.id === hotkey.id ? { ...defaultHk, readonly: hotkey.readonly } : h))
                              }
                            }}
                            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="恢复默认"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v5h5" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {/* 帮助提示 */}
              <div className="pt-4 mt-4" style={{ borderColor: 'var(--border-color)', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  点击修改后按下组合键即可，按 ESC 取消
                  {hotkeyConflict && <span style={{ color: 'var(--error-color, #EF4444)' }}>与「{hotkeyConflict}」冲突</span>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* MCP 操作即时生效；其他设置保留统一保存。 */}
        {activeTab !== 'mcp' && <div className="flex justify-between items-center px-6 py-4" style={{ borderColor: 'var(--border-color)', borderTopWidth: '1px' }}>
          <div className="flex-1">
            {saveMessage && (
              <span className="text-sm" style={{ color: saveMessage === '保存成功' ? 'var(--success-color, #22C55E)' : 'var(--error-color, #EF4444)' }}>
                {saveMessage}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded transition-colors"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-white rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>}
      </div>
    </div>
  )
}

export default SettingsModal
