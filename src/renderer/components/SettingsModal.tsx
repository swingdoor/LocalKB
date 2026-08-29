import { useCallback, useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, RefreshCcw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { AISettings, GeneralSettings, HotkeyConfig } from '@shared/types'
import type { McpStatus, PublicMcpSettings } from '@shared/mcp-types'
import { DEFAULT_HOTKEYS } from '@shared/types'
import { AI_PROVIDERS, getAIProvider } from '@shared/ai-providers'
import { DEFAULT_GENERAL_SETTINGS, EDITOR_FONT_OPTIONS, getEditorFont } from '@shared/editor-fonts'
import { useAppStore } from '../stores/appStore'
import { formatHotkeyDisplay, getModifiersFromEvent, hasSameHotkey } from '../utils/hotkeys'
import { Alert, AlertDescription } from './ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'general' | 'ai' | 'hotkey' | 'mcp'

const initialAISettings: AISettings = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: getAIProvider('deepseek').baseUrl,
  model: 'deepseek-v4-flash',
  polishPrompt: '请对以下文本进行润色，使其更加流畅、专业，同时保持原意不变。只返回润色后的文本，不要添加任何解释或说明：\n\n',
  expandPrompt: '请对以下文本进行扩写，丰富内容细节，增加相关论述，使其更加完整充实。只返回扩写后的文本，不要添加任何解释或说明：\n\n',
}

const statusLabel: Record<McpStatus['state'], string> = {
  disabled: '已停止', starting: '启动中', running: '运行中', error: '启动失败',
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS)
  const [aiSettings, setAiSettings] = useState<AISettings>(initialAISettings)
  const [isSaving, setIsSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [aiPromptTab, setAiPromptTab] = useState<'polish' | 'expand'>('polish')
  const [hotkeys, setHotkeys] = useState<HotkeyConfig[]>([])
  const [editingHotkeyId, setEditingHotkeyId] = useState<string | null>(null)
  const [hotkeyConflict, setHotkeyConflict] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [mcpSettings, setMcpSettings] = useState<PublicMcpSettings>({ enabled: false, port: 17890, maskedToken: '' })
  const [mcpStatus, setMcpStatus] = useState<McpStatus>({ state: 'disabled', port: 0, endpoint: '' })
  const [mcpUrl, setMcpUrl] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setPageError(null)
    void Promise.all([
      window.electronAPI.settings.getGeneral(),
      window.electronAPI.settings.getAI(),
      window.electronAPI.settings.getHotkeys(),
      window.electronAPI.settings.getMcp(),
      window.electronAPI.settings.getMcpStatus(),
      window.electronAPI.settings.getMcpUrl(),
    ]).then(([general, ai, hks, mcp, status, url]) => {
      if (!active) return
      setGeneralSettings(general)
      setAiSettings(ai)
      setHotkeys(hks)
      setMcpSettings(mcp)
      setMcpStatus(status)
      setMcpUrl(url)
    }).catch((error) => {
      console.error('Failed to load settings:', error)
      if (active) setPageError('设置加载失败，请关闭后重试。')
    })
    return () => { active = false }
  }, [isOpen])

  const handleSave = async () => {
    setIsSaving(true)
    setPageError(null)
    try {
      const [savedGeneral] = await Promise.all([
        window.electronAPI.settings.saveGeneral(generalSettings),
        window.electronAPI.settings.saveAI(aiSettings),
        window.electronAPI.settings.saveHotkeys(hotkeys.filter((item) => !item.readonly)),
      ])
      useAppStore.getState().updateGeneralSettings(savedGeneral)
      useAppStore.getState().updateHotkeys(hotkeys)
      toast.success('设置已保存')
      onClose()
    } catch (error) {
      console.error('Failed to save settings:', error)
      setPageError('设置保存失败，请重试。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMcpToggle = async (enabled: boolean) => {
    setMcpBusy(true)
    setPageError(null)
    try {
      setMcpSettings(await window.electronAPI.settings.saveMcp(enabled))
      setMcpStatus(await window.electronAPI.settings.getMcpStatus())
      toast.success(enabled ? 'MCP 服务已启动' : 'MCP 服务已停止')
    } catch (error) {
      console.error('Failed to update MCP service:', error)
      setMcpStatus(await window.electronAPI.settings.getMcpStatus())
      setPageError('MCP 服务状态更新失败。')
    } finally {
      setMcpBusy(false)
    }
  }

  const handleMcpRefresh = async () => {
    setRefreshConfirmOpen(false)
    setMcpBusy(true)
    setPageError(null)
    try {
      setMcpSettings(await window.electronAPI.settings.resetMcpToken())
      setMcpUrl(await window.electronAPI.settings.getMcpUrl())
      setMcpStatus(await window.electronAPI.settings.getMcpStatus())
      toast.success('MCP 连接地址已刷新')
    } catch (error) {
      console.error('Failed to refresh MCP URL:', error)
      setPageError('MCP 连接地址刷新失败。')
    } finally {
      setMcpBusy(false)
    }
  }

  const handleMcpCopy = async () => {
    if (await window.electronAPI.settings.copyMcpUrl()) toast.success('连接地址已复制')
    else setPageError('连接地址复制失败。')
  }

  const checkHotkeyConflict = useCallback((hotkey: HotkeyConfig, excludeId?: string): string | null => {
    for (const current of hotkeys) {
      if (current.id !== excludeId && hasSameHotkey(current, hotkey)) return current.name
    }
    return null
  }, [hotkeys])

  const handleHotkeyKeyDown = useCallback((event: React.KeyboardEvent, hotkeyId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const hotkey = hotkeys.find((item) => item.id === hotkeyId)
    if (!hotkey) return
    if (event.key === 'Escape') {
      setEditingHotkeyId(null)
      setHotkeyConflict(null)
      return
    }
    const modifiers = getModifiersFromEvent(event)
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const next = { ...hotkey, key, modifiers, display: formatHotkeyDisplay({ key, modifiers }) }
    const conflict = checkHotkeyConflict(next, hotkeyId)
    if (conflict) {
      setHotkeyConflict(conflict)
      return
    }
    setHotkeys(hotkeys.map((item) => item.id === hotkeyId ? next : item))
    setEditingHotkeyId(null)
    setHotkeyConflict(null)
  }, [hotkeys, checkHotkeyConflict])

  const provider = getAIProvider(aiSettings.provider)
  const recommendedModel = provider.models.some((model) => model.value === aiSettings.model)
  const modelSelection = recommendedModel ? aiSettings.model : '__custom__'

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="flex h-[min(660px,calc(100vh-2rem))] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">设置</DialogTitle>
          <DialogDescription className="sr-only">管理基础设置、AI、快捷键和本地 MCP 服务。</DialogDescription>
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as TabType); setPageError(null) }} className="flex min-h-0 flex-1 flex-col">
            <div className="px-6 pt-5">
              <TabsList>
                <TabsTrigger value="general">基础设置</TabsTrigger>
                <TabsTrigger value="ai">AI 设置</TabsTrigger>
                <TabsTrigger value="hotkey">快捷键</TabsTrigger>
                <TabsTrigger value="mcp">MCP 服务</TabsTrigger>
              </TabsList>
            </div>

            {pageError && (
              <Alert variant="destructive" className="mx-6 mt-3 w-auto py-2">
                <AlertDescription>{pageError}</AlertDescription>
              </Alert>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <TabsContent value="general" className="m-0 space-y-5">
                <div className="grid max-w-md gap-2">
                  <Label>编辑字体</Label>
                  <Select
                    value={generalSettings.editorFont}
                    onValueChange={(value) => setGeneralSettings({
                      ...generalSettings,
                      editorFont: value as GeneralSettings['editorFont'],
                    })}
                  >
                    <SelectTrigger aria-label="编辑字体"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EDITOR_FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.id} value={font.id}>{font.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    保存后应用于所有文档，不改变知识库中的文档数据。
                  </p>
                </div>
                <div className="max-w-md rounded-md border bg-muted/30 p-4">
                  <p className="mb-2 text-xs text-muted-foreground">字体预览</p>
                  <p
                    className="text-base leading-7"
                    style={{ fontFamily: getEditorFont(generalSettings.editorFont).fontFamily }}
                  >
                    极简笔记，让知识记录自然流畅。Aa 123
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="ai" className="m-0 space-y-5">
                <div className="grid max-w-md gap-2">
                  <Label>提供商</Label>
                  <Select value={aiSettings.provider} onValueChange={(value) => {
                    const nextProvider = getAIProvider(value as AISettings['provider'])
                    setAiSettings({
                      ...aiSettings,
                      provider: nextProvider.id,
                      baseUrl: nextProvider.baseUrl,
                      model: nextProvider.models[0]?.value ?? '',
                    })
                  }}>
                    <SelectTrigger aria-label="模型提供商"><SelectValue placeholder="选择提供商" /></SelectTrigger>
                    <SelectContent>{AI_PROVIDERS.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="grid max-w-md gap-2">
                  <Label htmlFor={provider.models.length ? undefined : 'model-id'}>模型 ID</Label>
                  {provider.models.length ? (
                    <>
                      <Select value={modelSelection} onValueChange={(value) => setAiSettings({ ...aiSettings, model: value === '__custom__' ? '' : value })}>
                        <SelectTrigger aria-label="模型 ID"><SelectValue placeholder="选择推荐模型" /></SelectTrigger>
                        <SelectContent>
                          {provider.models.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                          <SelectItem value="__custom__">自定义模型 ID…</SelectItem>
                        </SelectContent>
                      </Select>
                      {modelSelection === '__custom__' && (
                        <Input
                          id="model-id"
                          aria-label="自定义模型 ID"
                          value={aiSettings.model}
                          onChange={(event) => setAiSettings({ ...aiSettings, model: event.target.value })}
                          placeholder="输入模型代码"
                        />
                      )}
                    </>
                  ) : (
                    <Input
                      id="model-id"
                      value={aiSettings.model}
                      onChange={(event) => setAiSettings({ ...aiSettings, model: event.target.value })}
                      placeholder="输入模型代码"
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <div className="relative max-w-md">
                    <Input
                      id="api-key"
                      type={showApiKey ? 'text' : 'password'}
                      value={aiSettings.apiKey}
                      onChange={(event) => setAiSettings({ ...aiSettings, apiKey: event.target.value })}
                      placeholder="输入 API Key"
                      className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9" aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {aiSettings.provider === 'custom' && (
                  <div className="grid max-w-md gap-2">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input
                      id="base-url"
                      value={aiSettings.baseUrl}
                      onChange={(event) => setAiSettings({ ...aiSettings, baseUrl: event.target.value })}
                      placeholder="例如 https://example.com/v1"
                    />
                    <p className="text-xs text-muted-foreground">填写 OpenAI 兼容接口的 Base URL。</p>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>提示词</Label>
                  <Tabs value={aiPromptTab} onValueChange={(value) => setAiPromptTab(value as 'polish' | 'expand')}>
                    <TabsList><TabsTrigger value="polish">润色</TabsTrigger><TabsTrigger value="expand">扩写</TabsTrigger></TabsList>
                    <Textarea
                      className="mt-2 min-h-32 resize-none"
                      value={aiPromptTab === 'polish' ? aiSettings.polishPrompt : aiSettings.expandPrompt}
                      onChange={(event) => setAiSettings({
                        ...aiSettings,
                        [aiPromptTab === 'polish' ? 'polishPrompt' : 'expandPrompt']: event.target.value,
                      })}
                    />
                  </Tabs>
                </div>
              </TabsContent>

              <TabsContent value="hotkey" className="m-0 space-y-2">
                {hotkeys.filter((item) => item.id !== 'commandMenu').map((hotkey) => (
                  <div key={hotkey.id} className={`flex min-h-10 items-center gap-4 rounded-md px-2 ${hotkey.readonly ? 'text-muted-foreground' : 'hover:bg-muted/50'}`}>
                    <span className="min-w-0 flex-1 truncate text-sm">{hotkey.name}</span>
                    {editingHotkeyId === hotkey.id ? (
                      <Button
                        autoFocus
                        variant="secondary"
                        className="w-36 font-mono"
                        onKeyDown={(event) => handleHotkeyKeyDown(event, hotkey.id)}
                        onBlur={() => { setEditingHotkeyId(null); setHotkeyConflict(null) }}
                      >
                        请按组合键…
                      </Button>
                    ) : hotkey.readonly ? (
                      <span
                        className="inline-flex h-9 w-36 items-center justify-center rounded-md bg-muted/50 px-3 font-mono text-sm opacity-60"
                        aria-label={`${hotkey.name} 快捷键（不可修改）`}
                      >
                        {formatHotkeyDisplay(hotkey)}
                      </span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-36 font-mono font-normal"
                            aria-label={`${hotkey.name} 快捷键，双击修改`}
                            onDoubleClick={() => { setEditingHotkeyId(hotkey.id); setHotkeyConflict(null) }}
                          >
                            {formatHotkeyDisplay(hotkey)}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>双击修改快捷键</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`恢复 ${hotkey.name} 默认值`} disabled={hotkey.readonly} onClick={() => {
                        const fallback = DEFAULT_HOTKEYS.find((item) => item.id === hotkey.id)
                        if (fallback) setHotkeys(hotkeys.map((item) => item.id === hotkey.id ? { ...fallback, readonly: hotkey.readonly } : item))
                      }}><RotateCcw className="h-4 w-4" /></Button></TooltipTrigger>
                      <TooltipContent>恢复默认</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
                <Separator className="my-4" />
                <p className="text-sm text-muted-foreground">双击快捷键组合进行修改，按 Esc 取消。</p>
                {hotkeyConflict && <Alert variant="destructive"><AlertDescription>与“{hotkeyConflict}”冲突，请换一个组合键。</AlertDescription></Alert>}
              </TabsContent>

              <TabsContent value="mcp" className="m-0 space-y-5">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">本地 MCP 服务</h3>
                      <span className={`h-2 w-2 rounded-full ${mcpStatus.state === 'running' ? 'bg-green-600' : mcpStatus.state === 'error' ? 'bg-destructive' : 'bg-muted-foreground/50'}`} />
                      <span className="text-xs text-muted-foreground">{statusLabel[mcpStatus.state]}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">仅本机 Agent 可访问，极简笔记退出后服务停止。</p>
                  </div>
                  <Switch aria-label="启用本地 MCP 服务" checked={mcpSettings.enabled} disabled={mcpBusy} onCheckedChange={(checked) => void handleMcpToggle(checked)} />
                </div>
                {mcpStatus.error && <Alert variant="destructive"><AlertDescription>{mcpStatus.error}</AlertDescription></Alert>}
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="mcp-url">连接地址</Label>
                    <Button type="button" variant="ghost" size="sm" aria-label="刷新 MCP 连接地址" disabled={mcpBusy} onClick={() => setRefreshConfirmOpen(true)}>
                      <RefreshCcw className={`mr-2 h-4 w-4 ${mcpBusy ? 'animate-spin' : ''}`} />刷新地址
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input id="mcp-url" readOnly value={mcpUrl} aria-label="MCP 连接地址" />
                    <Tooltip>
                      <TooltipTrigger asChild><Button type="button" variant="outline" size="icon" aria-label="复制 MCP 连接地址" onClick={() => void handleMcpCopy()}><Copy className="h-4 w-4" /></Button></TooltipTrigger>
                      <TooltipContent>复制连接地址</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">地址包含访问 token。除非主动刷新，否则启停或重启应用后地址保持不变。</p>
                </div>
              </TabsContent>
            </div>

            {activeTab !== 'mcp' && (
              <div className="flex justify-end gap-2 border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={onClose}>取消</Button>
                <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>{isSaving ? '保存中…' : '保存'}</Button>
              </div>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={refreshConfirmOpen} onOpenChange={setRefreshConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刷新 MCP 连接地址？</AlertDialogTitle>
            <AlertDialogDescription>当前 token 将立即失效，之前复制给 Agent 的所有连接地址都需要更新。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleMcpRefresh()}>确认刷新</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default SettingsModal
