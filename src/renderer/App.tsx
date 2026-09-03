import { AlertCircle, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import ExcalidrawCanvas from './components/ExcalidrawCanvas'
import SearchModal from './components/SearchModal'
import SettingsModal from './components/SettingsModal'
import { useAppStore } from './stores/appStore'
import { loadXiaolaiFont } from './utils/loadFonts'
import { eventMatchesHotkey, formatHotkeyDisplay } from './utils/hotkeys'
import type { SearchHit } from '@shared/knowledge-types'
import { getEditorFont } from '@shared/editor-fonts'
import { getApplicationTheme } from '@shared/application-themes'
import {
  discardPendingSaves,
  flushPendingSaves,
  hasPendingSaves,
} from './utils/pendingSaveCoordinator'
import { finishPendingSavesBeforeClose } from './utils/closeWorkflow'
import { isExternalEventForVault } from './utils/knowledgeEventPolicy'
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './components/ui/alert-dialog'
import { Button } from './components/ui/button'
import { Skeleton } from './components/ui/skeleton'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { ResizablePane } from './components/ui/resizable-pane'

type ConfirmationKind = 'close-retry' | 'close-discard' | 'external-reload'
interface PendingConfirmation {
  kind: ConfirmationKind
  resolve: (confirmed: boolean) => void
}

function App() {
  const {
    currentVault,
    selectedContent,
    contentLoading,
    contentError,
    currentContent,
    isSearchOpen,
    isSettingsOpen,
    sidebarOpen,
    generalSettings,
    hotkeys,
    loadVaults,
    loadHotkeys,
    selectContent,
    revealContent,
    updateDocument,
    replaceCanvas,
    setSearchOpen,
    setSettingsOpen,
  } = useAppStore()
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null)
  const confirmationRef = useRef<PendingConfirmation | null>(null)

  const requestConfirmation = useCallback((kind: ConfirmationKind) => new Promise<boolean>((resolve) => {
    confirmationRef.current?.resolve(false)
    const next = { kind, resolve }
    confirmationRef.current = next
    setConfirmation(next)
  }), [])

  const settleConfirmation = useCallback((confirmed: boolean) => {
    const pending = confirmationRef.current
    if (!pending) return
    confirmationRef.current = null
    setConfirmation(null)
    pending.resolve(confirmed)
  }, [])

  // 初始化
  useEffect(() => {
    loadVaults()
    loadHotkeys()
    loadXiaolaiFont()
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--editor-font-family',
      getEditorFont(generalSettings.editorFont).fontFamily,
    )
    return () => { document.documentElement.style.removeProperty('--editor-font-family') }
  }, [generalSettings.editorFont])

  useEffect(() => {
    let handlingClose = false
    return window.electronAPI.window.onCloseRequested(() => {
      if (handlingClose) return
      handlingClose = true
      void finishPendingSavesBeforeClose({
        flush: flushPendingSaves,
        discard: discardPendingSaves,
        confirmRetry: () => requestConfirmation('close-retry'),
        confirmDiscard: () => requestConfirmation('close-discard'),
        complete: window.electronAPI.window.completeClose,
      }).finally(() => {
          handlingClose = false
      })
    })
  }, [requestConfirmation])

  useEffect(() => window.electronAPI.knowledge.onChanged((event) => {
    void (async () => {
    const state = useAppStore.getState()
    if (!isExternalEventForVault(event, state.currentVault?.id)) return
    const selected = state.selectedContent
    const affectsOpenContent = selected?.id === event.resourceId && (
      event.resourceType === 'document' || event.resourceType === 'canvas'
    )
    if (affectsOpenContent) {
      if (hasPendingSaves() && !await requestConfirmation('external-reload')) return
      discardPendingSaves()
      if (event.change === 'deleted') {
        useAppStore.setState({
          selectedContent: null, currentContent: null,
          contentLoading: false, contentError: null,
        })
      } else if (selected) {
        useAppStore.setState({ currentContent: null, contentLoading: true, contentError: null })
        void state.selectContent(selected)
      }
    }
    if (event.resourceType === 'tree' || event.resourceType === 'document' ||
        event.resourceType === 'canvas') {
      void state.loadContents(event.vaultId)
    }
    })()
  }), [requestConfirmation])

  useEffect(() => () => {
    confirmationRef.current?.resolve(false)
    confirmationRef.current = null
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
      
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hotkeys, setSearchOpen])

  // 搜索选择文档
  const handleSearchSelect = (content: SearchHit) => {
    revealContent(content.id)
    void selectContent(content)
    setSearchOpen(false)
  }
  const searchHotkey = hotkeys.find(h => h.id === 'search')
  const searchHotkeyDisplay = searchHotkey ? formatHotkeyDisplay(searchHotkey) : formatHotkeyDisplay({ key: 'k', modifiers: ['ctrl'] })

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <ResizablePane
            defaultWidth={240}
            minWidth={200}
            maxWidth={420}
            resizeFrom="east"
            storageKey="workspace-sidebar-width"
            separatorLabel="调整侧边栏宽度"
          >
            <Sidebar />
          </ResizablePane>
        )}
        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          {contentLoading && !currentContent ? (
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 px-12 py-14" role="status" aria-label={`正在加载${selectedContent?.title || '内容'}`}>
              <Skeleton className="h-9 w-2/5" />
              <Skeleton className="h-4 w-3/5" />
              <div className="mt-8 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ) : contentError && !currentContent ? (
            <div className="grid h-full place-items-center px-8">
              <Alert variant="destructive" className="max-w-lg">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>无法打开“{selectedContent?.title || '所选内容'}”</AlertTitle>
                <AlertDescription className="break-words">{contentError}</AlertDescription>
                {selectedContent && (
                  <Button variant="outline" size="sm" className="mt-4"
                    onClick={() => void selectContent(selectedContent)}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    重试
                  </Button>
                )}
              </Alert>
            </div>
          ) : currentContent ? (
            currentContent.contentType === 'canvas' ? (
              <ExcalidrawCanvas
                key={currentContent.id}
                canvas={currentContent}
                onUpdate={replaceCanvas}
              />
            ) : currentContent.contentType === 'document' ? (
              <Editor
                key={currentContent.id}
                document={currentContent}
                vaultId={currentVault?.id || ''}
                onUpdate={updateDocument}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                思维导图资源已就绪，请从文档引用中打开编辑。
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {currentVault ? (
                <div className="text-center">
                  <p className="mb-2 text-base text-foreground">选择或创建一个文档开始编辑</p>
                  <p className="text-sm">按 {searchHotkeyDisplay} 快速搜索</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="mb-2 text-base text-foreground">欢迎使用极简笔记</p>
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
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => { if (!open) settleConfirmation(false) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.kind === 'close-retry' && '保存失败'}
              {confirmation?.kind === 'close-discard' && '放弃未保存的更改？'}
              {confirmation?.kind === 'external-reload' && '内容已在外部更新'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === 'close-retry' && '最后一次保存没有成功。你可以重试，或继续选择是否放弃更改。'}
              {confirmation?.kind === 'close-discard' && '尚未保存的更改将永久丢失，此操作无法撤销。'}
              {confirmation?.kind === 'external-reload' && '重新加载会放弃当前未保存的更改；保留当前编辑则暂不载入外部版本。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleConfirmation(false)}>
              {confirmation?.kind === 'close-retry' ? '不重试' : confirmation?.kind === 'external-reload' ? '保留当前编辑' : '继续编辑'}
            </AlertDialogCancel>
            <AlertDialogAction
              className={confirmation?.kind === 'close-discard' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
              onClick={() => settleConfirmation(true)}
            >
              {confirmation?.kind === 'close-retry' ? '重试保存' : confirmation?.kind === 'external-reload' ? '重新加载' : '放弃并退出'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster
        position="bottom-right"
        theme={getApplicationTheme(generalSettings.applicationTheme).appearance}
      />
    </div>
    </TooltipProvider>
  )
}

export default App
