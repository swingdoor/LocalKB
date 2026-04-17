import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from 'lowlight'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import FontSize from '../extensions/FontSize'
import Color from '../extensions/Color'
import ResizableImage from '../extensions/ResizableImage'
import MindMapNode from '../extensions/MindMapNode'
import { HeadingNumbers } from '../extensions/HeadingNumbers'
import CodeBlockComponent from './CodeBlockComponent'
import CommandMenu from './CommandMenu'
import EditorBubbleMenu from './BubbleMenu'
import DrawingEditorModal from './DrawingEditorModal'
import MindMapEditorModal from './MindMapEditorModal'
import PolishConfirmModal from './PolishConfirmModal'
import TocPanel from './TocPanel'
import { useCommandMenu } from '../hooks/useCommandMenu'
import { useAIProcess } from '../hooks/useAIProcess'
import { useCanvasEdit } from '../hooks/useCanvasEdit'
import { useMindMapEdit } from '../hooks/useMindMapEdit'
import { useDebouncedSave } from '../hooks/useDebouncedSave'
import { useToc } from '../hooks/useToc'
import { useAppStore } from '../stores/appStore'
import { addNumbersToHTML } from '../utils/pdfExport'
import type { Document, HotkeyConfig } from '@shared/types'

interface EditorProps {
  document: Document
  vaultId: string
  onUpdate: (data: Partial<Document>) => void
}

function Editor({ document, vaultId: _vaultId, onUpdate }: EditorProps) {
  const [title, setTitle] = useState(document.title)

  // 从 store 获取快捷键配置
  const hotkeys = useAppStore((state) => state.hotkeys)
  const showHeadingNumbers = useAppStore((state) => state.showHeadingNumbers)
  const toggleHeadingNumbers = useAppStore((state) => state.toggleHeadingNumbers)

  // 使用自定义 Hooks
  const { saveContent, saveTitle } = useDebouncedSave(onUpdate)
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
  const canvasEditRef = useRef<{ createCanvas: () => void }>({ createCanvas: () => {} })
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
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: '输入 Alt+\\ 打开命令菜单...',
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
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
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockComponent)
        },
      }).configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      MindMapNode,
    ],
    content: (() => {
      try {
        return JSON.parse(document.content)
      } catch {
        return { type: 'doc', content: [{ type: 'paragraph' }] }
      }
    })(),
    onUpdate: ({ editor: ed }) => {
      const json = JSON.stringify(ed.getJSON())
      saveContent(json)
    },
    editorProps: {
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
          let matches = true
          if (hotkey.modifiers.includes('ctrl') && !event.ctrlKey && !event.metaKey) matches = false
          if (hotkey.modifiers.includes('alt') && !event.altKey) matches = false
          if (hotkey.modifiers.includes('shift') && !event.shiftKey) matches = false
          if (hotkey.key.toLowerCase() !== event.key.toLowerCase()) matches = false
          if (hotkey.readonly) matches = false // 跳过只读快捷键
          
          if (matches) {
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
  const canvasEdit = useCanvasEdit(editor)

  // 思维导图编辑 Hook（需要 editor 实例）
  const mindMapEdit = useMindMapEdit(editor)

  // TOC Hook（需要在 editor 初始化后使用）
  const { toc, isPanelVisible, togglePanel, handleNavigate } = useToc(editor)

  // 命令菜单 Hook（需要 editor 实例和回调）
  const commandMenu = useCommandMenu(editor, {
    onSelectImage: async () => {
      return await window.electronAPI.file.selectImage()
    },
    onCreateCanvas: canvasEdit.createCanvas,
    onCreateMindMap: mindMapEdit.createMindMap,
  })

  // 更新 refs（每次渲染同步最新引用）
  canvasEditRef.current = canvasEdit
  mindMapEditRef.current = mindMapEdit
  commandMenuRef.current = commandMenu
  hotkeysRef.current = hotkeys

  // 标题变化时保存
  useEffect(() => {
    if (title !== document.title) {
      saveTitle(title)
    }
  }, [title, document.title, saveTitle])

  // 导出 PDF
  const handleExportPDF = useCallback(async () => {
    if (!editor) {
      return
    }
    try {
      let htmlContent = editor.getHTML()

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
  }, [editor, title, showHeadingNumbers, toc])

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
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-3xl font-bold bg-transparent border-none outline-none"
              style={{ color: 'var(--text-primary)' }}
              placeholder="无标题"
            />
            <div className="mt-2 text-xs flex items-center gap-4" style={{ color: 'var(--text-secondary)' }}>
              <span>创建于 {formatTime(document.createdAt)}</span>
              <span>上次保存 {formatTime(document.updatedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
                onEditCanvas={canvasEdit.handleEditCanvas}
                onEditMindMap={mindMapEdit.handleEditMindMap}
                onPolish={handlePolish}
                onExpand={handleExpand}
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
          onSave={canvasEdit.handleSaveCanvas}
          onClose={canvasEdit.closeCanvasEditor}
        />
      )}

      {/* 思维导图编辑模态框 */}
      {mindMapEdit.editingMindMap && (
        <MindMapEditorModal
          mindmapData={mindMapEdit.editingMindMap.data}
          isOpen={!!mindMapEdit.editingMindMap}
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
