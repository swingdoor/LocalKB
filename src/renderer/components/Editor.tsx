import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Download, FileDown, FileText, Hash, ListTree, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from 'lowlight'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { Placeholder } from '@tiptap/extensions'
import { FontFamily } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Markdown } from '@tiptap/markdown'
import FontSize from '../extensions/FontSize'
import Color from '../extensions/Color'
import ResizableImage from '../extensions/ResizableImage'
import { HeadingNumbers } from '../extensions/HeadingNumbers'
import { StableNodeId } from '../extensions/StableNodeId'
import { AssetImage, CanvasReference, MindMapReference } from '../extensions/ResourceReferences'
import { DocumentReferenceNode, FileAttachmentNode } from '../extensions/RichDocumentNodes'
import CodeBlockComponent from './CodeBlockComponent'
import CommandMenu from './CommandMenu'
import TableMenu from './TableMenu'
import DrawingEditorModal from './DrawingEditorModal'
import MindMapEditorModal from './MindMapEditorModal'
import MindMapEditorErrorBoundary from './MindMapEditorErrorBoundary'
import AIProcessModal from './AIProcessModal'
import DocumentReferencePicker from './DocumentReferencePicker'
import EditorRootBlockControls from './EditorRootBlockControls'
import EditorContextMenus from './editor-menus/EditorContextMenus'
import TocPanel from './TocPanel'
import { useCommandMenu } from '../hooks/useCommandMenu'
import { useAIProcess } from '../hooks/useAIProcess'
import { useCanvasEdit } from '../hooks/useCanvasEdit'
import { useMindMapEdit } from '../hooks/useMindMapEdit'
import { usePendingSave } from '../hooks/usePendingSave'
import { useToc } from '../hooks/useToc'
import { useAppStore } from '../stores/appStore'
import { addNumbersToHTML } from '../utils/pdfExport'
import { handleRichPaste } from '../utils/richPaste'
import { resolveResourceReferencesForExport } from '../utils/resourceExport'
import { eventMatchesHotkey } from '../utils/hotkeys'
import {
  MarkdownDetails,
  MarkdownDetailsContent,
  MarkdownDetailsSummary,
  MarkdownTable,
  MarkdownTextStyle,
} from '../markdown/markdownExtensions'
import { exportDocumentMarkdown } from '../markdown/exportDocumentMarkdown'
import type { HotkeyConfig } from '@shared/types'
import type { ContentSummary, LoadedDocument, TipTapDocument } from '@shared/knowledge-types'
import { createEditorInteractionCoordinator } from '../editor/interactionContext'
import { handleRootBlockDrop } from '../editor/rootBlockDrop'
import { insertManagedResourceReference } from '../editor/insertManagedResource'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface EditorProps {
  document: LoadedDocument
  vaultId: string
  onUpdate: (data: { title?: string; content?: TipTapDocument }) => Promise<LoadedDocument>
}

function countContentCharacters(text: string) {
  return text.replace(/\s/g, '').length
}

function Editor({ document, vaultId, onUpdate }: EditorProps) {
  const [title, setTitle] = useState(document.title)
  const [characterCount, setCharacterCount] = useState(0)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [markdownExporting, setMarkdownExporting] = useState(false)
  const [documentReferencePickerOpen, setDocumentReferencePickerOpen] = useState(false)
  const interaction = useMemo(() => createEditorInteractionCoordinator(), [])
  const documentReferenceResolverRef = useRef<((value: { documentId: string; label: string } | null) => void) | null>(null)

  // 从 store 获取快捷键配置
  const hotkeys = useAppStore((state) => state.hotkeys)
  const showHeadingNumbers = useAppStore((state) => state.showHeadingNumbers)
  const toggleHeadingNumbers = useAppStore((state) => state.toggleHeadingNumbers)
  const contents = useAppStore((state) => state.contents)

  // 使用自定义 Hooks
  const pendingSave = usePendingSave(onUpdate)
  const aiProcess = useAIProcess()

  const openDocumentReferencePicker = useCallback(() => new Promise<{
    documentId: string
    label: string
  } | null>((resolve) => {
    documentReferenceResolverRef.current?.(null)
    documentReferenceResolverRef.current = resolve
    interaction.setModalOpen('document-reference-picker', true)
    setDocumentReferencePickerOpen(true)
  }), [interaction])

  const closeDocumentReferencePicker = useCallback(() => {
    interaction.setModalOpen('document-reference-picker', false)
    setDocumentReferencePickerOpen(false)
    const resolve = documentReferenceResolverRef.current
    documentReferenceResolverRef.current = null
    resolve?.(null)
  }, [interaction])

  const selectReferencedDocument = useCallback((target: ContentSummary) => {
    interaction.setModalOpen('document-reference-picker', false)
    setDocumentReferencePickerOpen(false)
    const resolve = documentReferenceResolverRef.current
    documentReferenceResolverRef.current = null
    resolve?.({ documentId: target.id, label: target.title })
  }, [interaction])

  const openReferencedDocument = useCallback((documentId: string) => {
    const state = useAppStore.getState()
    const target = state.contents.find(
      (item) => item.id === documentId && item.contentType === 'document',
    )
    if (!target) return
    state.revealContent(documentId)
    void state.selectContent(target)
  }, [])

  useEffect(() => () => {
    documentReferenceResolverRef.current?.(null)
    documentReferenceResolverRef.current = null
  }, [])

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Refs 用于 editorProps 中引用后定义的 hooks
  const canvasEditRef = useRef<{
    createCanvas: () => void
    handleEditCanvas: (canvasId: string) => Promise<void>
  }>({ createCanvas: () => {}, handleEditCanvas: async () => undefined })
  const commandMenuRef = useRef<{ handleCommandSelect: (cmd: string) => void; handleKeyDown: (view: any, e: KeyboardEvent) => boolean }>({
    handleCommandSelect: () => {},
    handleKeyDown: () => false,
  })
  const mindMapEditRef = useRef<ReturnType<typeof useMindMapEdit> | null>(null)
  // 快捷键配置 ref（用于在 handleKeyDown 中访问最新的配置）
  const hotkeysRef = useRef<HotkeyConfig[]>(hotkeys)

  // 初始化编辑器
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        // 排除 codeBlock，使用 CodeBlockLowlight 替代
        codeBlock: false,
        // Link 使用独立配置；Underline 使用 StarterKit v3 内置扩展。
        link: false,
        dropcursor: {
          color: 'var(--primary-color)',
          width: 2,
        },
      }),
      Link.configure({
        openOnClick: false,
        protocols: ['file'],
        validate: (href) => /^https?:\/\//.test(href) || /^file:\/\/\//.test(href),
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      MarkdownTable.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: '在段落开头输入 / 打开命令菜单...',
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: false,
        interaction,
      }),
      MarkdownTextStyle,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      FontSize.configure({
        types: ['textStyle'],
      }),
      Color.configure({
        types: ['textStyle'],
      }),
      Highlight.configure({ multicolor: true }),
      MarkdownDetails.configure({ persist: false }),
      MarkdownDetailsSummary,
      MarkdownDetailsContent,
      HeadingNumbers,
      CanvasReference.configure({
        vaultId,
        interaction,
        onEdit: (canvasId) => { void canvasEditRef.current.handleEditCanvas(canvasId) },
      }),
      MindMapReference.configure({
        vaultId,
        interaction,
        onEdit: (mindmapId) => { void mindMapEditRef.current?.handleEditMindMap(mindmapId) },
      }),
      AssetImage.configure({ vaultId, interaction }),
      DocumentReferenceNode.configure({
        onOpen: openReferencedDocument,
      }),
      FileAttachmentNode.configure({ vaultId }),
      StableNodeId,
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent)
        },
      }).configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      Markdown,
    ],
    shouldRerenderOnTransaction: false,
    content: document.content,
    onUpdate: ({ editor: ed }) => {
      setCharacterCount(countContentCharacters(ed.getText()))
      pendingSave.schedule({ content: ed.getJSON() as TipTapDocument })
    },
    editorProps: {
      handleDrop: handleRootBlockDrop,
      handlePaste: (view, event) => {
        const imageFile = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith('image/'))
        const htmlDataUrl = event.clipboardData?.getData('text/html').match(/src=["'](data:image\/[^"']+)["']/)?.[1]
        if (imageFile || htmlDataUrl) {
          event.preventDefault()
          void (async () => {
            const mimeType = imageFile?.type || htmlDataUrl!.match(/^data:([^;]+);/)?.[1] || 'image/png'
            const bytes = imageFile
              ? new Uint8Array(await imageFile.arrayBuffer())
              : Uint8Array.from(atob(htmlDataUrl!.split(',')[1]), (char) => char.charCodeAt(0))
            const resourceId = crypto.randomUUID()
            await insertManagedResourceReference(
              view,
              vaultId,
              document.id,
              {
                resourceType: 'asset', resourceId, mimeType, bytes,
                ...(imageFile?.name ? { fileName: imageFile.name } : {}),
              },
              'assetImage',
              { assetId: resourceId, textAlign: 'left', alt: imageFile?.name || null },
            )
          })()
          return true
        }
        return handleRichPaste(view, event)
      },
      handleKeyDown: (view, event) => {
        // Tab 键处理：在行首插入缩进
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault()
          const { state, dispatch } = view
          const { $from } = state.selection
          const lineStart = $from.start()
          const posInLine = $from.pos - lineStart
          const indent = posInLine <= 2 ? '\u3000\u3000' : '  '
          const tr = state.tr.insertText(indent, $from.pos)
          dispatch(tr)
          return true
        }
        // 全局快捷键（从配置读取）
        for (const hotkey of hotkeysRef.current) {
          if (!hotkey.readonly && eventMatchesHotkey(event, hotkey)) {
            event.preventDefault()
            switch (hotkey.id) {
              case 'canvasCommand':
                canvasEditRef.current.createCanvas()
                return true
              case 'imageCommand':
                commandMenuRef.current.handleCommandSelect('image')
                return true
              case 'mindmapCommand':
                mindMapEditRef.current?.createMindMap()
                return true
            }
            break
          }
        }
        // 将键盘事件委托给 commandMenu
        return commandMenuRef.current.handleKeyDown(view, event)
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement
        const linkEl = target.closest('a[href]')
        if (linkEl) {
          event.preventDefault()
          const href = linkEl.getAttribute('href')
          if (!href) return
          if (href.startsWith('file:///')) {
            const filePath = href.replace('file:///', '').replace(/\//g, '\\')
            window.electronAPI.file.openLocalFile(filePath)
          } else {
            window.open(href, '_blank')
          }
          return true
        }
        return false
      },
    },
  })

  // 画布编辑 Hook（需要 editor 实例）
  const canvasEdit = useCanvasEdit(editor, vaultId, document.id)

  // 思维导图编辑 Hook（需要 editor 实例）
  const mindMapEdit = useMindMapEdit(editor, vaultId, document.id)

  const canvasEditorOpen = Boolean(canvasEdit.editingCanvas)
  const mindMapEditorOpen = Boolean(mindMapEdit.editingMindMap)

  useEffect(() => {
    interaction.setModalOpen('document-reference-picker', documentReferencePickerOpen)
    return () => interaction.setModalOpen('document-reference-picker', false)
  }, [documentReferencePickerOpen, interaction])

  useEffect(() => {
    interaction.setModalOpen('canvas-editor', canvasEditorOpen)
    return () => interaction.setModalOpen('canvas-editor', false)
  }, [canvasEditorOpen, interaction])

  useEffect(() => {
    interaction.setModalOpen('mindmap-editor', mindMapEditorOpen)
    return () => interaction.setModalOpen('mindmap-editor', false)
  }, [interaction, mindMapEditorOpen])

  useEffect(() => {
    interaction.setModalOpen('ai-confirm', aiProcess.showProcessModal)
    return () => interaction.setModalOpen('ai-confirm', false)
  }, [aiProcess.showProcessModal, interaction])

  // TOC Hook（需要在 editor 初始化后使用）
  const { toc, isPanelVisible, togglePanel, handleNavigate } = useToc(editor)

  // 命令菜单 Hook（需要 editor 实例和回调）
  const commandMenu = useCommandMenu(editor, {
    onSelectImage: async () => {
      interaction.setModalOpen('image-picker', true)
      try {
        const image = await window.electronAPI.file.selectImage()
        if (!image) return null
        const match = image.data.match(/^data:([^;]+);base64,(.+)$/)
        if (!match) return null
        const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
        const resourceId = crypto.randomUUID()
        const result = await insertManagedResourceReference(
          editor!.view,
          vaultId,
          document.id,
          {
            resourceType: 'asset', resourceId, mimeType: match[1], bytes,
            fileName: image.name,
          },
          'assetImage',
          { assetId: resourceId, textAlign: 'left', alt: image.name },
        )
        if (!result.ok) toast.error(result.error.message)
        return null
      } finally {
        interaction.setModalOpen('image-picker', false)
      }
    },
    onCreateCanvas: canvasEdit.createCanvas,
    onCreateMindMap: mindMapEdit.createMindMap,
    onSelectDocument: openDocumentReferencePicker,
    onSelectAttachment: async () => {
      interaction.setModalOpen('attachment-picker', true)
      try {
        const file = await window.electronAPI.file.selectAttachment()
        if (!file) return null
        const bytes = new Uint8Array(file.bytes)
        const resourceId = crypto.randomUUID()
        const result = await insertManagedResourceReference(
          editor!.view,
          vaultId,
          document.id,
          {
            resourceType: 'asset', resourceId, mimeType: file.mimeType, bytes,
            fileName: file.name,
          },
          'fileAttachment',
          { assetId: resourceId, displayName: file.name },
        )
        if (!result.ok) {
          alert(result.error.message)
          return null
        }
        return null
      } catch (error) {
        alert(error instanceof Error ? error.message : '附件选择失败')
        return null
      } finally {
        interaction.setModalOpen('attachment-picker', false)
      }
    },
  })

  // 更新 refs（每次渲染同步最新引用）
  useEffect(() => {
    if (editor) {
      setCharacterCount(countContentCharacters(editor.getText()))
    }
  }, [editor, document.id])

  canvasEditRef.current = canvasEdit
  mindMapEditRef.current = mindMapEdit
  commandMenuRef.current = commandMenu
  hotkeysRef.current = hotkeys

  // 标题变化时保存
  useEffect(() => {
    if (title !== document.title) {
      pendingSave.schedule({ title })
    }
  }, [title, document.title, pendingSave.schedule])

  // 导出 PDF
  const handleExportPDF = useCallback(async () => {
    if (!editor || pdfExporting) return
    setPdfExporting(true)
    const toastId = toast.loading('正在导出 PDF…')
    try {
      let htmlContent = await resolveResourceReferencesForExport(
        editor.getHTML(), vaultId,
      )

      // 如果开启了序号显示，则在 HTML 中添加序号
      if (showHeadingNumbers && toc.length > 0) {
        htmlContent = addNumbersToHTML(htmlContent, toc)
      }

      const result = await window.electronAPI.file.exportPDF(title, htmlContent)
      if (result.canceled) {
        toast.info('已取消 PDF 导出', { id: toastId })
      } else {
        toast.success('PDF 导出完成', {
          id: toastId,
          action: {
            label: '打开所在文件夹',
            onClick: () => {
              void window.electronAPI.file.revealPDFExport(result.revealId)
                .then((revealed) => {
                  if (!revealed) toast.error('导出位置已失效，请重新导出')
                })
                .catch((error) => {
                  toast.error(error instanceof Error ? error.message : '无法打开导出位置')
                })
            },
          },
        })
      }
    } catch (error: unknown) {
      console.error('Export PDF error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('占用') || errorMessage.includes('EBUSY') || errorMessage.includes('locked')) {
        toast.error('文件正在被其他程序占用，请关闭后重试', { id: toastId })
      } else {
        toast.error('导出 PDF 失败，请重试', { id: toastId })
      }
    } finally {
      setPdfExporting(false)
    }
  }, [document.id, editor, pdfExporting, showHeadingNumbers, title, toc, vaultId])

  const handleExportMarkdown = useCallback(async () => {
    if (!editor || markdownExporting) return
    setMarkdownExporting(true)
    const toastId = toast.loading('正在导出 Markdown…')
    try {
      const result = await exportDocumentMarkdown(editor, {
        document: structuredClone(editor.getJSON()) as TipTapDocument,
        metadata: {
          vaultId,
          documentId: document.id,
          title,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      })
      if (result.canceled) {
        toast.info('已取消 Markdown 导出', { id: toastId })
      } else {
        const action = {
          label: '打开所在文件夹',
          onClick: () => {
            void window.electronAPI.file.revealMarkdownExport(result.result.revealId)
              .catch((error) => {
                toast.error(error instanceof Error ? error.message : '无法打开导出位置')
              })
          },
        }
        if (result.result.warningCount > 0) {
          const labels = result.result.warnings.slice(0, 3).map((warning) => warning.label).join('、')
          const suffix = result.result.warningCount > 3 ? '等' : ''
          toast.warning(`Markdown 已导出，${result.result.warningCount} 项资源未完成：${labels}${suffix}`, {
            id: toastId,
            duration: 8000,
            action,
          })
        } else {
          toast.success('Markdown 导出完成', { id: toastId, action })
        }
      }
    } catch (error) {
      console.error('Export Markdown error:', error)
      toast.error(error instanceof Error ? error.message : '导出 Markdown 失败', { id: toastId })
    } finally {
      setMarkdownExporting(false)
    }
  }, [document.createdAt, document.id, document.updatedAt, editor, markdownExporting, title, vaultId])

  // AI 处理回调（润色/扩写）
  const handlePolish = useCallback((text: string) => {
    if (editor) {
      aiProcess.handleAIProcess(text, 'polish', editor)
    }
  }, [editor, aiProcess])

  const handleExpand = useCallback((text: string) => {
    if (editor) {
      aiProcess.handleAIProcess(text, 'expand', editor)
    }
  }, [editor, aiProcess])

  const handleCustom = useCallback((text: string) => {
    if (editor) aiProcess.beginCustomProcess(text, editor)
  }, [editor, aiProcess])

  // AI 确认回调
  const handlePolishConfirm = useCallback(() => {
    if (editor) {
      aiProcess.confirmProcess(editor)
    }
  }, [editor, aiProcess])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 文档标题 */}
      <div className="flex-shrink-0 border-b px-4 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              aria-label="文档标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full border-0 px-0 text-[26px] font-semibold leading-9 shadow-none focus-visible:ring-0 md:text-[26px] md:leading-9"
              placeholder="无标题"
            />
            <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
              <span>创建于 {formatTime(document.createdAt)}</span>
              <span>上次保存 {formatTime(document.updatedAt)}</span>
              <span>{'\u5b57\u6570'} {characterCount}</span>
              {(pendingSave.pending || pendingSave.saving) && <span>正在保存…</span>}
              {pendingSave.error && (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-destructive"
                  onClick={() => void pendingSave.retry().catch(() => undefined)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />保存失败，重试
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild><Button type="button" variant={isPanelVisible ? 'secondary' : 'ghost'} size="sm" onClick={togglePanel}><ListTree className="mr-2 h-4 w-4" />目录</Button></TooltipTrigger>
              <TooltipContent>{isPanelVisible ? '隐藏目录' : '显示目录'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild><Button type="button" variant={showHeadingNumbers ? 'secondary' : 'ghost'} size="sm" onClick={toggleHeadingNumbers}><Hash className="mr-2 h-4 w-4" />序号</Button></TooltipTrigger>
              <TooltipContent>{showHeadingNumbers ? '隐藏章节序号' : '显示章节序号'}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm"><Download className="mr-2 h-4 w-4" />导出</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={pdfExporting}
                  onSelect={() => void handleExportPDF()}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {pdfExporting ? '正在导出 PDF…' : '导出 PDF'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={markdownExporting}
                  onSelect={() => void handleExportMarkdown()}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {markdownExporting ? '正在导出 Markdown…' : '导出 Markdown'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 编辑器内容 */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 overflow-y-auto bg-background px-8 pb-8 ${showHeadingNumbers ? 'show-heading-numbers' : ''}`}>
          {editor && (
            <>
              <EditorContextMenus
                editor={editor}
                interaction={interaction}
                vaultId={vaultId}
                onEditCanvas={canvasEdit.handleEditCanvas}
                onEditMindMap={mindMapEdit.handleEditMindMap}
                onOpenDocument={openReferencedDocument}
                onSelectDocument={openDocumentReferencePicker}
                onPolish={handlePolish}
                onExpand={handleExpand}
                onCustom={handleCustom}
              />
              <TableMenu
                editor={editor}
                interaction={interaction}
                hidden={aiProcess.showProcessModal || documentReferencePickerOpen || !!canvasEdit.editingCanvas || !!mindMapEdit.editingMindMap}
              />
              <EditorContent editor={editor} className="editor-content-shell prose max-w-none" />
              <EditorRootBlockControls editor={editor} interaction={interaction} />
            </>
          )}
        </div>

        {/* 目录面板 */}
        <TocPanel
          toc={toc}
          onNavigate={handleNavigate}
          isVisible={isPanelVisible}
          onToggle={togglePanel}
          showNumbers={showHeadingNumbers}
        />
      </div>

      {/* 命令菜单 */}
      {commandMenu.showCommandMenu && (
        <CommandMenu
          position={commandMenu.commandMenuPos}
          searchQuery={commandMenu.searchQuery}
          onSearchChange={commandMenu.setSearchQuery}
          onSelect={commandMenu.handleCommandSelect}
          onClose={commandMenu.closeCommandMenu}
        />
      )}

      {/* 画布编辑模态框 */}
      {canvasEdit.editingCanvas && (
        <DrawingEditorModal
          canvasData={canvasEdit.editingCanvas.data}
          loading={canvasEdit.editingCanvas.loading}
          resourceError={canvasEdit.editingCanvas.error}
          onSave={canvasEdit.handleSaveCanvas}
          onClose={canvasEdit.closeCanvasEditor}
        />
      )}

      {/* 思维导图编辑模态框 */}
      {mindMapEdit.editingMindMap && (
        <MindMapEditorErrorBoundary onClose={mindMapEdit.closeMindMapEditor}>
          <MindMapEditorModal
            mindmapData={mindMapEdit.editingMindMap.data}
            isOpen={!!mindMapEdit.editingMindMap}
            loading={mindMapEdit.editingMindMap.loading}
            resourceError={mindMapEdit.editingMindMap.error}
            onSave={mindMapEdit.handleSaveMindMap}
            onClose={mindMapEdit.closeMindMapEditor}
          />
        </MindMapEditorErrorBoundary>
      )}

      {documentReferencePickerOpen && (
        <DocumentReferencePicker
          documents={contents}
          currentDocumentId={document.id}
          onSelect={selectReferencedDocument}
          onClose={closeDocumentReferencePicker}
        />
      )}

      {/* 润色、扩写和自定义修改共用同一套处理流程 */}
      <AIProcessModal
        isOpen={aiProcess.showProcessModal}
        mode={aiProcess.mode}
        phase={aiProcess.processState.phase}
        originalText={aiProcess.processState.originalText}
        processedText={aiProcess.processState.processedText}
        error={aiProcess.processState.error}
        onSubmitInstruction={(instruction) => { void aiProcess.submitCustomProcess(instruction) }}
        onReviseInstruction={aiProcess.reviseCustomProcess}
        onConfirm={handlePolishConfirm}
        onCancel={aiProcess.cancelProcess}
        onOpenSettings={aiProcess.cancelProcess}
      />
    </div>
  )
}

export default Editor
