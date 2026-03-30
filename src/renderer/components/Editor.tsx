import React, { useState, useCallback, useEffect } from 'react'
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
import type { Document } from '../App'

interface EditorProps {
  document: Document
  vaultId: string
  onUpdate: (data: { title?: string; content?: string }) => void
}

function Editor({ document, vaultId, onUpdate }: EditorProps) {
  const [title, setTitle] = useState(document.title)
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandMenuPos, setCommandMenuPos] = useState({ x: 0, y: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [editingCanvas, setEditingCanvas] = useState<{ id: string; data: string; isEditing?: boolean } | null>(null)
  
  // 润色相关状态
  const [showPolishModal, setShowPolishModal] = useState(false)
  const [polishState, setPolishState] = useState<{
    originalText: string
    polishedText: string
    isLoading: boolean
    error?: string
    selectionRange?: { from: number; to: number }
  }>({
    originalText: '',
    polishedText: '',
    isLoading: false,
  })

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

  // 防抖保存
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null)

  const saveContent = useCallback((content: string) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    const timeout = setTimeout(() => {
      onUpdate({ content })
    }, 1000)
    setSaveTimeout(timeout)
  }, [onUpdate, saveTimeout])

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
        // 检测 \ 键 或 Alt 键呼出命令菜单
        if (event.key === '\\' || event.key === 'Alt') {
          event.preventDefault()
          const { from } = view.state.selection
          const coords = view.coordsAtPos(from)
          setCommandMenuPos({ x: coords.left, y: coords.bottom + 5 })
          setShowCommandMenu(true)
          setSearchQuery('')
          return true
        }
        // Escape 关闭命令菜单
        if (event.key === 'Escape' && showCommandMenu) {
          setShowCommandMenu(false)
          return true
        }
        return false
      },
    },
  })

  // 标题变化时保存
  useEffect(() => {
    if (title !== document.title) {
      if (saveTimeout) clearTimeout(saveTimeout)
      const timeout = setTimeout(() => {
        onUpdate({ title })
      }, 500)
      setSaveTimeout(timeout)
    }
  }, [title])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeout) clearTimeout(saveTimeout)
    }
  }, [])

  // 命令菜单选择处理
  const handleCommandSelect = async (command: string) => {
    setShowCommandMenu(false)
    
    if (!editor) return

    switch (command) {
      case 'h1':
        editor.chain().focus().toggleHeading({ level: 1 }).run()
        break
      case 'h2':
        editor.chain().focus().toggleHeading({ level: 2 }).run()
        break
      case 'h3':
        editor.chain().focus().toggleHeading({ level: 3 }).run()
        break
      case 'h4':
        editor.chain().focus().toggleHeading({ level: 4 }).run()
        break
      case 'h5':
        editor.chain().focus().toggleHeading({ level: 5 }).run()
        break
      case 'h6':
        editor.chain().focus().toggleHeading({ level: 6 }).run()
        break
      case 'bullet':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'ordered':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'task':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'quote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'code':
        editor.chain().focus().toggleCodeBlock().run()
        break
      case 'divider':
        editor.chain().focus().setHorizontalRule().run()
        break
      case 'image':
        const result = await window.electronAPI.file.selectImage()
        if (result) {
          editor.chain().focus().setImage({ src: result.data }).run()
        }
        break
      case 'canvas':
        // 创建空画布并打开编辑器
        setEditingCanvas({ id: `canvas-${Date.now()}`, data: '' })
        break
    }
  }

  // 保存画布
  const handleSaveCanvas = (imageData: string, excalidrawData: string) => {
    if (editor && editingCanvas) {
      // 将 Excalidraw 数据编码存储在 title 属性中
      const encodedData = btoa(encodeURIComponent(excalidrawData))
      
      // 如果是编辑现有画布，需要更新对应的图片节点
      if (editingCanvas.isEditing) {
        // 查找并更新现有画布
        const { state } = editor
        let foundPos: number | null = null
        
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.alt === editingCanvas.id) {
            foundPos = pos
            return false
          }
          return true
        })
        
        if (foundPos !== null) {
          editor.chain().focus()
            .setNodeSelection(foundPos)
            .setImage({ src: imageData, alt: editingCanvas.id, title: encodedData })
            .run()
        }
      } else {
        // 新建画布
        editor.chain().focus().setImage({ 
          src: imageData,
          alt: editingCanvas.id,
          title: encodedData,
        }).run()
      }
    }
    setEditingCanvas(null)
  }

  // 编辑已有画布
  const handleEditCanvas = (canvasId: string, _imageData: string) => {
    // 从编辑器中获取 Excalidraw 原始数据
    if (!editor) return
    
    const { state } = editor
    let excalidrawData = ''
    
    state.doc.descendants((node) => {
      if (node.type.name === 'image' && node.attrs.alt === canvasId && node.attrs.title) {
        try {
          excalidrawData = decodeURIComponent(atob(node.attrs.title))
        } catch {
          excalidrawData = ''
        }
        return false
      }
      return true
    })
    
    setEditingCanvas({ id: canvasId, data: excalidrawData, isEditing: true })
  }

  // 导出 PDF
  const handleExportPDF = async () => {
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
  }

  // 处理润色请求
  const handlePolish = async (text: string) => {
    if (!editor) return
    
    // 保存选区范围
    const { from, to } = editor.state.selection
    
    setPolishState({
      originalText: text,
      polishedText: '',
      isLoading: true,
      selectionRange: { from, to },
    })
    setShowPolishModal(true)

    try {
      const result = await window.electronAPI.ai.polish(text)
      
      if (result.success && result.text) {
        setPolishState(prev => ({
          ...prev,
          polishedText: result.text!,
          isLoading: false,
        }))
      } else {
        setPolishState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || '润色失败',
        }))
      }
    } catch (err: any) {
      setPolishState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || '润色请求失败',
      }))
    }
  }

  // 确认替换润色结果
  const handlePolishConfirm = () => {
    if (!editor || !polishState.selectionRange || !polishState.polishedText) return
    
    const { from, to } = polishState.selectionRange
    
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .deleteSelection()
      .insertContent(polishState.polishedText)
      .run()
    
    setShowPolishModal(false)
    setPolishState({
      originalText: '',
      polishedText: '',
      isLoading: false,
    })
  }

  // 取消润色
  const handlePolishCancel = () => {
    setShowPolishModal(false)
    setPolishState({
      originalText: '',
      polishedText: '',
      isLoading: false,
    })
  }

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
              onEditCanvas={handleEditCanvas}
              onPolish={handlePolish}
              hidden={showPolishModal}
            />
            <EditorContent editor={editor} className="prose max-w-none" />
          </>
        )}
      </div>
      
      {/* 命令菜单 */}
      {showCommandMenu && (
        <CommandMenu
          position={commandMenuPos}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={handleCommandSelect}
          onClose={() => setShowCommandMenu(false)}
        />
      )}
      
      {/* 画布编辑模态框 */}
      {editingCanvas && (
        <DrawingEditorModal
          canvasData={editingCanvas.data}
          onSave={handleSaveCanvas}
          onClose={() => setEditingCanvas(null)}
        />
      )}

      {/* 润色确认模态框 */}
      <PolishConfirmModal
        isOpen={showPolishModal}
        originalText={polishState.originalText}
        polishedText={polishState.polishedText}
        isLoading={polishState.isLoading}
        error={polishState.error}
        onConfirm={handlePolishConfirm}
        onCancel={handlePolishCancel}
        onOpenSettings={handlePolishCancel}
      />
    </div>
  )
}

export default Editor
