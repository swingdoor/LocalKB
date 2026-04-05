import { useState, useEffect, useCallback, useRef } from 'react'
import type { AISettings, HotkeyConfig } from '@shared/types'
import { useAppStore } from '../stores/appStore'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'ai' | 'hotkey'

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
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-coder', label: 'DeepSeek Coder' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
]

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ai')
  
  // AI 设置状态
  const [aiSettings, setAiSettings] = useState<AISettings>({
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
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

  useEffect(() => {
    if (isOpen) {
      loadAllSettings()
    }
  }, [isOpen])

  const loadAllSettings = async () => {
    try {
      const ai = await window.electronAPI.settings.getAI()
      setAiSettings(ai)
      
      const hks = await window.electronAPI.settings.getHotkeys()
      setHotkeys(hks)
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
        window.electronAPI.settings.saveHotkeys(hotkeys),
      ])
      
      // 更新 store 中的配置
      const { updateHotkeys } = useAppStore.getState()
      updateHotkeys(hotkeys)
      
      setSaveMessage('保存成功')
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setSaveMessage('保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  // 快捷键冲突检测
  const checkHotkeyConflict = useCallback((hotkey: HotkeyConfig, excludeId?: string): string | null => {
    for (const hk of hotkeys) {
      if (hk.id === excludeId) continue
      if (hk.key.toLowerCase() === hotkey.key.toLowerCase() && 
          JSON.stringify(hk.modifiers.sort()) === JSON.stringify(hotkey.modifiers.sort())) {
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

    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('ctrl')
    if (e.altKey) modifiers.push('alt')
    if (e.shiftKey) modifiers.push('shift')

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return
    }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

    const newHotkey: HotkeyConfig = {
      ...hotkey,
      key,
      modifiers,
      display: [...modifiers.map(m => m === 'ctrl' ? 'Ctrl' : m === 'alt' ? 'Alt' : 'Shift'), key.toUpperCase()].join('+'),
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
        model: providerId === 'deepseek' ? 'deepseek-chat' : '',
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

          {/* 快捷键设置标签页 */}
          {activeTab === 'hotkey' && (
            <div className="space-y-4">
              {hotkeys.filter(h => h.id !== 'commandMenu').map((hotkey) => (
                <div key={hotkey.id} className="flex items-center gap-4">
                  <span className="w-24 text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{hotkey.name}</span>
                  
                  {editingHotkeyId === hotkey.id ? (
                    <div className="flex items-center gap-2">
                      <span 
                        className="px-3 py-1 text-sm border rounded font-mono"
                        style={{ backgroundColor: 'var(--primary-color)', color: '#fff', borderColor: 'var(--primary-color)' }}
                        onKeyDown={(e) => handleHotkeyKeyDown(e, hotkey.id)}
                        tabIndex={0}
                      >
                        ...
                      </span>
                      <button
                        onClick={cancelEditHotkey}
                        className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 text-sm rounded font-mono"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {hotkey.display}
                      </span>
                      <button
                        onClick={() => startEditHotkey(hotkey.id)}
                        className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        修改
                      </button>
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

        {/* 底部按钮 */}
        <div className="flex justify-between items-center px-6 py-4" style={{ borderColor: 'var(--border-color)', borderTopWidth: '1px' }}>
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
        </div>
      </div>
    </div>
  )
}

export default SettingsModal