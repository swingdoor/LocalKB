import React, { useState } from 'react'
import { BubbleMenu, Editor } from '@tiptap/react'

interface BubbleMenuProps {
  editor: Editor
  vaultId: string
  onEditCanvas?: (canvasId: string, imageData: string) => void
  onPolish?: (text: string) => void
  onExpand?: (text: string) => void
  hidden?: boolean
}

function EditorBubbleMenu({ editor, vaultId, onEditCanvas, onPolish, onExpand, hidden = false }: BubbleMenuProps) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)

  // 设置链接
  const setLink = () => {
    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: linkUrl })
        .run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }

  // 下载图片
  const downloadImage = async () => {
    const { node } = editor.state.selection as any
    if (node?.type.name === 'image' && node.attrs.src) {
      await window.electronAPI.file.downloadImage(node.attrs.src, 'image.png')
    }
  }

  // 判断是否选中图片（支持 NodeSelection）
  const isImageSelected = () => {
    const { selection } = editor.state
    const node = (selection as any).node
    if (node?.type.name === 'image') return true
    if (selection.$anchor.parent.type.name === 'image') return true
    return false
  }

  // 获取选中的图片节点
  const getSelectedImageNode = () => {
    const { selection } = editor.state
    const node = (selection as any).node
    if (node?.type.name === 'image') {
      return node
    }
    if (selection.$anchor.parent.type.name === 'image') {
      return selection.$anchor.parent
    }
    return null
  }

  // 判断是否选中画布（画布的 alt 以 canvas- 开头）
  const isCanvasSelected = () => {
    const node = getSelectedImageNode()
    return node?.type.name === 'image' && node.attrs.alt?.startsWith('canvas-')
  }

  // 编辑画布
  const editCanvas = () => {
    const node = getSelectedImageNode()
    if (node?.type.name === 'image' && node.attrs.alt?.startsWith('canvas-')) {
      onEditCanvas?.(node.attrs.alt, node.attrs.src || '')
    }
  }

  // 检查是否有选区
  const hasSelection = () => {
    const { from, to } = editor.state.selection
    return from !== to || isImageSelected()
  }

  // 渲染链接输入
  const renderLinkInput = () => (
    <>
      <input
        type="url"
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setLink()
          if (e.key === 'Escape') {
            setShowLinkInput(false)
            setLinkUrl('')
          }
        }}
        placeholder="输入链接地址..."
        className="px-2 py-1 text-sm border-none outline-none w-48"
        autoFocus
      />
      <button onClick={setLink} className="px-2 py-1 text-sm text-primary">
        确定
      </button>
      <button
        onClick={() => {
          setShowLinkInput(false)
          setLinkUrl('')
        }}
        className="px-2 py-1 text-sm text-gray-500"
      >
        取消
      </button>
    </>
  )

  // 渲染图片菜单
  const renderImageMenu = () => {
    const isCanvas = isCanvasSelected()
    return (
      <>
        {/* 编辑画布按钮（仅对画布显示） */}
        {isCanvas && (
          <>
            <button onClick={editCanvas} title="编辑画布">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <div className="divider" />
          </>
        )}
        
        {/* 对齐方式 */}
        <button
          onClick={() => editor.chain().focus().setImageAlign('left').run()}
          className={getSelectedImageNode()?.attrs.textAlign === 'left' ? 'is-active' : ''}
          title="左对齐"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().setImageAlign('center').run()}
          className={getSelectedImageNode()?.attrs.textAlign === 'center' ? 'is-active' : ''}
          title="居中"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().setImageAlign('right').run()}
          className={getSelectedImageNode()?.attrs.textAlign === 'right' ? 'is-active' : ''}
          title="右对齐"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
          </svg>
        </button>
        
        <div className="divider" />
        
        {/* 下载 */}
        <button onClick={downloadImage} title="下载图片">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </>
    )
  }

  // 渲染文本菜单
  const renderTextMenu = () => (
    <>
      {/* 加粗 */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="加粗"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
        </svg>
      </button>
      
      {/* 斜体 */}
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="斜体"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h4m-2 0v16m4-16h-4m4 16h-4" transform="skewX(-10)" />
        </svg>
      </button>
      
      {/* 删除线 */}
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="删除线"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.5 12h-11M12 7.5c-2.5 0-4 1.5-4 3 0 2 2.5 2.5 4 3s4 1 4 3c0 1.5-1.5 3-4 3" />
        </svg>
      </button>
      
      {/* 链接 */}
      <button
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
          } else {
            setShowLinkInput(true)
            setLinkUrl(editor.getAttributes('link').href || '')
          }
        }}
        className={editor.isActive('link') ? 'is-active' : ''}
        title="链接"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>

      {/* 润色 */}
      <button
        onClick={() => {
          const { from, to } = editor.state.selection
          const selectedText = editor.state.doc.textBetween(from, to, ' ')
          if (selectedText.trim()) {
            onPolish?.(selectedText)
          }
        }}
        title="AI润色"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </button>

      {/* 扩写 */}
      <button
        onClick={() => {
          const { from, to } = editor.state.selection
          const selectedText = editor.state.doc.textBetween(from, to, ' ')
          if (selectedText.trim()) {
            onExpand?.(selectedText)
          }
        }}
        title="AI扩写"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
      
      <div className="divider" />
      
      {/* 对齐方式 */}
      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
        title="左对齐"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
        title="居中"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
        title="右对齐"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        className={editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}
        title="两端对齐"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </>
  )

  // 渲染菜单内容
  const renderMenuContent = () => {
    if (showLinkInput) {
      return renderLinkInput()
    }
    if (isImageSelected()) {
      return renderImageMenu()
    }
    return renderTextMenu()
  }

  return (
    <BubbleMenu 
      editor={editor} 
      tippyOptions={{ 
        duration: 100,
        ...(hidden && { getReferenceClientRect: null })
      }}
      shouldShow={({ state }) => {
        // 隐藏时不显示
        if (hidden) return false
        
        // 检查是否选中了图片节点
        const { selection } = state
        const node = (selection as any).node
        if (node?.type.name === 'image') return true
        if (selection.$anchor.parent.type.name === 'image') return true
        
        // 检查是否有文本选区
        const { from, to } = selection
        return from !== to
      }}
    >
      <div className="bubble-menu" style={{ display: hidden ? 'none' : 'flex' }}>
        {renderMenuContent()}
      </div>
    </BubbleMenu>
  )
}

export default EditorBubbleMenu
