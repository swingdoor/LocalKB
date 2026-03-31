import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import ResizableImage from '../extensions/ResizableImage'
import CommandMenu from './CommandMenu'
import EditorBubbleMenu from './BubbleMenu'
import DrawingEditorModal from './DrawingEditorModal'
import PolishConfirmModal from './PolishConfirmModal'
import { useCommandMenu } from '../hooks/useCommandMenu'
import { useAIProcess } from '../hooks/useAIProcess'
import { useCanvasEdit } from '../hooks/useCanvasEdit'
import { useDebouncedSave } from '../hooks/useDebouncedSave'
import type { Document } from '@shared/types'

interface EditorProps {
  document: Document
  vaultId: string
  onUpdate: (data: Partial<Document>) => void
}

function Editor({ document, vaultId, onUpdate }: EditorProps) {
  const [title, setTitle] = useState(document.title)

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
    })
  }

  // 初始化编辑器
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Link.configure({
        openOnClick: false,
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
        placeholder: '输入 \\ 打开命令菜单...',
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
      }),
    ],
    content: (() => {
      try {
        return JSON.parse(document.content)
      } catch {
        return { type: 'doc', content: [{ type: 'paragraph' }] }
      }
    })(),
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON())
      saveContent(json)
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Tab 键处理：在行首插入缩进
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault()
          const { state, dispatch } = view
          const { $from } = state.selection

          // 获取当前行开始位置
          const lineStart = $from.start()
          const posInLine = $from.pos - lineStart

          // 如果在行首或行首附近（前2个字符内），插入2个全角空格的缩进
          if (posInLine <= 2) {
            const tr = state.tr.insertText('　　', $from.pos) // 2个全角空格
            dispatch(tr)
          } else {
            // 否则插入普通Tab（2个空格）
            const tr = state.tr.insertText('  ', $from.pos)
            dispatch(tr)
          }
          return true
        }
        // 将键盘事件委托给 commandMenu
        return commandMenu.handleKeyDown(view, event)
      },
    },
  })

  // 画布编辑 Hook（需要 editor 实例）
  const canvasEdit = useCanvasEdit(editor)

  // 命令菜单 Hook（需要 editor 实例和回调）
  const commandMenu = useCommandMenu(editor, {
    onSelectImage: async () => {
      return await window.electronAPI.file.selectImage()
    },
    onCreateCanvas: canvasEdit.createCanvas,
  })

  // 标题变化时保存
  useEffect(() => {
    if (title !== document.title) {
      saveTitle(title)
    }
  }, [title, document.title, saveTitle])

  // 导出 PDF
  const handleExportPDF = useCallback(async () => {
    if (!editor) {
      console.error('Editor not ready')
      return
    }
    try {
      const htmlContent = editor.getHTML()
      console.log('Exporting PDF:', title, htmlContent.substring(0, 100))
      const result = await window.electronAPI.file.exportPDF(title, htmlContent)
      console.log('Export result:', result)
    } catch (err) {
      console.error('Export PDF error:', err)
    }
  }, [editor, title])

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
    <div className="h-full flex flex-col bg-white">
      {/* 文档标题 */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-3xl font-bold text-text bg-transparent border-none outline-none placeholder-gray-300"
              placeholder="无标题"
            />
            <div className="mt-2 text-xs text-gray-400 flex items-center gap-4">
              <span>创建于 {formatTime(document.createdAt)}</span>
              <span>上次保存 {formatTime(document.updatedAt)}</span>
            </div>
          </div>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
            title="导出PDF"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>导出PDF</span>
          </button>
        </div>
      </div>

      {/* 编辑器内容 */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {editor && (
          <>
            <EditorBubbleMenu
              editor={editor}
              vaultId={vaultId}
              onEditCanvas={canvasEdit.handleEditCanvas}
              onPolish={handlePolish}
              onExpand={handleExpand}
              hidden={aiProcess.showPolishModal || !!canvasEdit.editingCanvas}
            />
            <EditorContent editor={editor} className="prose max-w-none" />
          </>
        )}
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
