import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from 'lowlight'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import FontSize from '../extensions/FontSize'
import Color from '../extensions/Color'
import ResizableImage from '../extensions/ResizableImage'
import { HeadingNumbers } from '../extensions/HeadingNumbers'
import { StableNodeId } from '../extensions/StableNodeId'
import { AssetImage, CanvasReference, MindMapReference } from '../extensions/ResourceReferences'
import CodeBlockComponent from './CodeBlockComponent'
import CommandMenu from './CommandMenu'
import EditorBubbleMenu from './BubbleMenu'
import TableMenu from './TableMenu'
import DrawingEditorModal from './DrawingEditorModal'
import MindMapEditorModal from './MindMapEditorModal'
import PolishConfirmModal from './PolishConfirmModal'
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
import type { HotkeyConfig } from '@shared/types'
import type { LoadedDocument, TipTapDocument } from '@shared/knowledge-types'

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

  // 从 store 获取快捷键配置
  const hotkeys = useAppStore((state) => state.hotkeys)
  const showHeadingNumbers = useAppStore((state) => state.showHeadingNumbers)
  const toggleHeadingNumbers = useAppStore((state) => state.toggleHeadingNumbers)

  // 使用自定义 Hooks
  const pendingSave = usePendingSave(onUpdate)
  const aiProcess = useAIProcess()

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
      Table.configure({
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
      }),
      TextStyle,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      FontSize.configure({
        types: ['textStyle'],
      }),
      Color.configure({
        types: ['textStyle'],
      }),
      HeadingNumbers,
      CanvasReference.configure({
        vaultId,
        documentId: document.id,
        onEdit: (canvasId) => { void canvasEditRef.current.handleEditCanvas(canvasId) },
      }),
      MindMapReference.configure({
        vaultId,
        documentId: document.id,
        onEdit: (mindmapId) => { void mindMapEditRef.current?.handleEditMindMap(mindmapId) },
      }),
      AssetImage.configure({ vaultId, documentId: document.id }),
      StableNodeId,
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent)
        },
      }).configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
    ],
    content: document.content,
    onUpdate: ({ editor: ed }) => {
      setCharacterCount(countContentCharacters(ed.getText()))
      pendingSave.schedule({ content: ed.getJSON() as TipTapDocument })
    },
    editorProps: {
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
            const result = await window.electronAPI.knowledge.importAsset(
              vaultId, document.id, mimeType, bytes,
            )
            if (!result.ok) return
            const node = view.state.schema.nodes.assetImage.create({
              assetId: result.data.id, textAlign: 'left', alt: imageFile?.name || null,
            })
            view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
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

  // TOC Hook（需要在 editor 初始化后使用）
  const { toc, isPanelVisible, togglePanel, handleNavigate } = useToc(editor)

  // 命令菜单 Hook（需要 editor 实例和回调）
  const commandMenu = useCommandMenu(editor, {
    onSelectImage: async () => {
      const image = await window.electronAPI.file.selectImage()
      if (!image) return null
      const match = image.data.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return null
      const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
      const result = await window.electronAPI.knowledge.importAsset(
        vaultId, document.id, match[1], bytes,
      )
      return result.ok ? { assetId: result.data.id } : null
    },
    onCreateCanvas: canvasEdit.createCanvas,
    onCreateMindMap: mindMapEdit.createMindMap,
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
    if (!editor) {
      return
    }
    try {
      let htmlContent = await resolveResourceReferencesForExport(
        editor.getHTML(), vaultId, document.id,
      )

      // 如果开启了序号显示，则在 HTML 中添加序号
      if (showHeadingNumbers && toc.length > 0) {
        htmlContent = addNumbersToHTML(htmlContent, toc)
      }

      await window.electronAPI.file.exportPDF(title, htmlContent)
    } catch (err: any) {
      console.error('Export PDF error:', err)
      // 显示用户友好的错误提示
      const errorMessage = err?.message || String(err)
      if (errorMessage.includes('占用') || errorMessage.includes('EBUSY') || errorMessage.includes('locked')) {
        alert('文件正在被其他程序占用，请关闭后重试')
      } else {
        alert('导出 PDF 失败，请重试')
      }
    }
  }, [document.id, editor, showHeadingNumbers, title, toc, vaultId])

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

  // AI 确认回调
  const handlePolishConfirm = useCallback(() => {
    if (editor) {
      aiProcess.confirmPolish(editor)
    }
  }, [editor, aiProcess])

  return (
    <div className="h-full flex flex-col">
      {/* 文档标题 */}
      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-[22px] leading-7 font-medium bg-transparent border-none outline-none"
              style={{ color: 'var(--text-primary)' }}
              placeholder="无标题"
            />
            <div className="mt-1 text-xs flex items-center gap-4" style={{ color: 'var(--text-secondary)' }}>
              <span>创建于 {formatTime(document.createdAt)}</span>
              <span>上次保存 {formatTime(document.updatedAt)}</span>
              <span>{'\u5b57\u6570'} {characterCount}</span>
              {(pendingSave.pending || pendingSave.saving) && <span>正在保存…</span>}
              {pendingSave.error && (
                <button
                  type="button"
                  className="text-red-500 underline"
                  onClick={() => void pendingSave.retry().catch(() => undefined)}
                >
                  保存失败，重试
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button
              onClick={togglePanel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title={isPanelVisible ? "隐藏目录" : "显示目录"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span>目录</span>
            </button>
            <button
              onClick={toggleHeadingNumbers}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{ color: showHeadingNumbers ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              title={showHeadingNumbers ? "隐藏章节序号" : "显示章节序号"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span>序号</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title="导出PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>导出PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 编辑器内容 */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 overflow-y-auto px-8 pb-8 ${showHeadingNumbers ? 'show-heading-numbers' : ''}`} style={{ backgroundColor: 'var(--bg-editor)' }}>
          {editor && (
            <>
              <EditorBubbleMenu
                editor={editor}
                vaultId={vaultId}
                documentId={document.id}
                onEditCanvas={canvasEdit.handleEditCanvas}
                onEditMindMap={mindMapEdit.handleEditMindMap}
                onPolish={handlePolish}
                onExpand={handleExpand}
                hidden={aiProcess.showPolishModal || !!canvasEdit.editingCanvas || !!mindMapEdit.editingMindMap}
              />
              <TableMenu
                editor={editor}
                hidden={aiProcess.showPolishModal || !!canvasEdit.editingCanvas || !!mindMapEdit.editingMindMap}
              />
              <EditorContent editor={editor} className="prose max-w-none" />
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
        <MindMapEditorModal
          mindmapData={mindMapEdit.editingMindMap.data}
          isOpen={!!mindMapEdit.editingMindMap}
          loading={mindMapEdit.editingMindMap.loading}
          resourceError={mindMapEdit.editingMindMap.error}
          onSave={mindMapEdit.handleSaveMindMap}
          onClose={mindMapEdit.closeMindMapEditor}
        />
      )}

      {/* 润色/扩写确认模态框 */}
      <PolishConfirmModal
        isOpen={aiProcess.showPolishModal}
        mode={aiProcess.aiMode}
        originalText={aiProcess.polishState.originalText}
        polishedText={aiProcess.polishState.polishedText}
        isLoading={aiProcess.polishState.isLoading}
        error={aiProcess.polishState.error}
        onConfirm={handlePolishConfirm}
        onCancel={aiProcess.cancelPolish}
        onOpenSettings={aiProcess.cancelPolish}
      />
    </div>
  )
}

export default Editor
