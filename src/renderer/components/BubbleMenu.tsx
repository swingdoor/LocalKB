import { useState, useEffect, useCallback, useRef } from 'react'
import { BubbleMenu, Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import {
  ALargeSmall,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Download,
  Expand,
  Heading,
  Italic,
  Link as LinkIcon,
  Palette,
  Pencil,
  Sparkles,
  Strikethrough,
  Type,
  X,
} from 'lucide-react'


interface BubbleMenuProps {
  editor: Editor
  vaultId: string
  documentId: string
  onEditCanvas?: (canvasId: string) => void
  onEditMindMap?: (mindmapId: string) => void
  onPolish?: (text: string) => void
  onExpand?: (text: string) => void
  hidden?: boolean
}

// 选项常量（组件外，避免每次渲染重建）
const FONT_OPTIONS = [
  { label: '默认', value: '' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: '手写', value: 'Xiaolai, cursive' },
] as const

const SIZE_OPTIONS = [
  { label: '小', value: '12px' },
  { label: '正常', value: '16px' },
  { label: '大', value: '20px' },
  { label: '特大', value: '24px' },
] as const

const HEADING_OPTIONS = [
  { label: '正文', value: 0 },
  { label: '标题 1', value: 1 },
  { label: '标题 2', value: 2 },
  { label: '标题 3', value: 3 },
  { label: '标题 4', value: 4 },
  { label: '标题 5', value: 5 },
  { label: '标题 6', value: 6 },
] as const

const COLOR_OPTIONS = [
  { label: '默认', value: '' },
  { label: '黑色', value: '#000000' },
  { label: '深灰', value: '#333333' },
  { label: '红色', value: '#E03E3E' },
  { label: '橙色', value: '#E67E22' },
  { label: '黄色', value: '#F1C40F' },
  { label: '绿色', value: '#27AE60' },
  { label: '蓝色', value: '#2980B9' },
  { label: '紫色', value: '#8E44AD' },
  { label: '浅灰', value: '#95A5A6' },
] as const

const PROTOCOL_OPTIONS = [
  { label: 'https://', value: 'https://' },
  { label: 'http://', value: 'http://' },
  { label: '本地', value: 'local:' },
] as const

// 公共 dropdown trigger 样式
const DROPDOWN_TRIGGER_STYLE: React.CSSProperties = {
  width: '32px',
  height: '28px',
  padding: '0 6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
}

function EditorBubbleMenu({
  editor, vaultId, documentId, onEditCanvas, onEditMindMap, onPolish, onExpand, hidden = false,
}: BubbleMenuProps) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkProtocol, setLinkProtocol] = useState('https://')
  const [protocolDropdownOpen, setProtocolDropdownOpen] = useState(false)
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false)
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false)
  const [headingDropdownOpen, setHeadingDropdownOpen] = useState(false)
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false)
  const linkInputRef = useRef<HTMLInputElement>(null)

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = () => {
      setFontDropdownOpen(false)
      setSizeDropdownOpen(false)
      setHeadingDropdownOpen(false)
      setColorDropdownOpen(false)
      setProtocolDropdownOpen(false)
    }

    if (fontDropdownOpen || sizeDropdownOpen || headingDropdownOpen || colorDropdownOpen || protocolDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [fontDropdownOpen, sizeDropdownOpen, headingDropdownOpen, colorDropdownOpen, protocolDropdownOpen])

  // 链接输入框自动聚焦（延迟避免 HMR 冲突）
  useEffect(() => {
    if (showLinkInput) {
      const timer = setTimeout(() => {
        linkInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [showLinkInput])

  // 设置链接
  const setLink = useCallback(() => {
    if (linkUrl) {
      const href = linkProtocol === 'local:'
        ? `file:///${linkUrl.replace(/\\/g, '/')}`
        : `${linkProtocol}${linkUrl}`
      editor
        .chain()
        .focus()
        .setLink({ href })
        .run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
    setLinkProtocol('https://')
  }, [editor, linkUrl, linkProtocol])

  // 获取选中的图片节点（直接读 editor.state，不依赖闭包）
  const getSelectedImageNode = useCallback(() => {
    const { selection } = editor.state
    const node = (selection as NodeSelection).node
    if (node?.type.name === 'image' || node?.type.name === 'assetImage') {
      return node
    }
    if (selection.$anchor.parent.type.name === 'image' || selection.$anchor.parent.type.name === 'assetImage') {
      return selection.$anchor.parent
    }
    return null
  }, [editor])

  // 判断是否选中图片
  const isImageSelected = useCallback(() => {
    return getSelectedImageNode() !== null
  }, [getSelectedImageNode])

  const getSelectedCanvasNode = useCallback(() => {
    const { selection } = editor.state
    const node = (selection as NodeSelection).node
    return node?.type.name === 'canvasReference' ? node : null
  }, [editor])

  const isCanvasSelected = useCallback(() => getSelectedCanvasNode() !== null, [getSelectedCanvasNode])

  // 获取选中的思维导图节点
  const getSelectedMindMapNode = useCallback(() => {
    const { selection } = editor.state
    const node = (selection as NodeSelection).node
    if (node?.type.name === 'mindmapReference') {
      return node
    }
    if (selection.$anchor.parent.type.name === 'mindmapReference') {
      return selection.$anchor.parent
    }
    return null
  }, [editor])

  // 判断是否选中思维导图
  const isMindMapSelected = useCallback(() => {
    return getSelectedMindMapNode() !== null
  }, [getSelectedMindMapNode])

  const setSelectedNodeAlign = useCallback((textAlign: 'left' | 'center' | 'right') => {
    const { state, view } = editor
    const { selection } = state
    const node = (selection as NodeSelection).node
    if (!node || !['image', 'assetImage', 'canvasReference', 'mindmapReference'].includes(node.type.name)) return
    const transaction = state.tr.setNodeMarkup(selection.from, undefined, {
      ...node.attrs,
      textAlign,
    })
    transaction.setSelection(NodeSelection.create(transaction.doc, selection.from))
    view.dispatch(transaction)
    view.focus()
  }, [editor])

  const alignmentHandlers = useCallback((textAlign: 'left' | 'center' | 'right') => ({
    type: 'button' as const,
    onClick: () => setSelectedNodeAlign(textAlign),
  }), [setSelectedNodeAlign])

  // 下载图片
  const downloadImage = useCallback(async () => {
    const node = getSelectedImageNode()
    if (!node) return
    const src = node.type.name === 'assetImage'
      ? `localkb-resource://asset/${encodeURIComponent(vaultId)}/${encodeURIComponent(documentId)}/${encodeURIComponent(node.attrs.assetId)}`
      : node.attrs.src
    if (!src) return
    if (/^data:/.test(src)) {
      await window.electronAPI.file.downloadImage(src, 'image.png')
      return
    }
    const blob = await (await fetch(src)).blob()
    const reader = new FileReader()
    reader.onloadend = () => { void window.electronAPI.file.downloadImage(reader.result as string, 'image.png') }
    reader.readAsDataURL(blob)
  }, [documentId, getSelectedImageNode, vaultId])

  // 编辑画布
  const editCanvas = useCallback(() => {
    const node = getSelectedCanvasNode()
    if (node?.attrs.canvasId) onEditCanvas?.(node.attrs.canvasId)
  }, [getSelectedCanvasNode, onEditCanvas])

  // 编辑思维导图
  const editMindMap = useCallback(() => {
    const node = getSelectedMindMapNode()
    if (node?.type.name === 'mindmapReference' && node.attrs.mindmapId) {
      onEditMindMap?.(node.attrs.mindmapId)
    }
  }, [getSelectedMindMapNode, onEditMindMap])

  // 适应窗口 - 已移除

  const downloadCanvas = useCallback(async () => {
    const node = getSelectedCanvasNode()
    if (!node?.attrs.canvasId) return
    const result = await window.electronAPI.knowledge.getCanvas(vaultId, node.attrs.canvasId, documentId)
    if (!result.ok) return
    const scene = result.data as any
    const { exportToBlob } = await import('@excalidraw/excalidraw')
    const blob = await exportToBlob({
      elements: scene.elements, appState: { ...scene.appState, exportBackground: true },
      files: scene.files, exportPadding: 20, mimeType: 'image/png',
    })
    const reader = new FileReader()
    reader.onloadend = () => { void window.electronAPI.file.downloadImage(reader.result as string, '画布.png') }
    reader.readAsDataURL(blob)
  }, [documentId, getSelectedCanvasNode, vaultId])

  const downloadMindMap = useCallback(async () => {
    const node = getSelectedMindMapNode()
    if (!node?.attrs.mindmapId) return

    try {
      // Dynamically import MindElixir
      const MindElixir = (await import('mind-elixir')).default
      const { DARK_THEME, THEME } = await import('mind-elixir')

      // Create a temporary container
      const container = document.createElement('div')
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      container.style.top = '-9999px'
      document.body.appendChild(container)

      const isDark = document.documentElement.classList.contains('dark')
      const mind = new MindElixir({
        el: container,
        theme: isDark ? DARK_THEME : THEME,
      })

      const result = await window.electronAPI.knowledge.getMindMap(
        vaultId, documentId, node.attrs.mindmapId,
      )
      if (!result.ok) {
        document.body.removeChild(container)
        return
      }
      mind.init(result.data as any)

      // Wait for render then export
      setTimeout(async () => {
        try {
          const blob = await mind.exportPng(true, '0')
          if (blob) {
            const pad = (n: number) => n.toString().padStart(2, '0')
            const d = new Date()
            const timestamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
            const filename = `mindmap-${timestamp}.png`
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.click()
            URL.revokeObjectURL(url)
          }
        } catch (err) {
          console.error('Failed to export mind map:', err)
        } finally {
          document.body.removeChild(container)
        }
      }, 100)
    } catch (err) {
      console.error('Failed to download mind map:', err)
    }
  }, [documentId, getSelectedMindMapNode, vaultId])

  // 解析已有链接
  const parseExistingHref = useCallback((href: string) => {
    const protocolMatch = href.match(/^(https?:\/\/)(.*)/)
    if (protocolMatch) {
      setLinkProtocol(protocolMatch[1])
      setLinkUrl(protocolMatch[2])
    } else if (href.startsWith('file:///')) {
      setLinkProtocol('local:')
      setLinkUrl(href.slice(8).replace(/\//g, '\\'))
    } else {
      setLinkProtocol('https://')
      setLinkUrl(href)
    }
  }, [])

  // 渲染链接输入
  const renderLinkInput = () => (
    <>
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setProtocolDropdownOpen(!protocolDropdownOpen)
          }}
          className="px-1 py-1 text-sm border-none outline-none bg-transparent cursor-pointer hover:bg-gray-100 rounded"
          title="选择协议"
        >
          {PROTOCOL_OPTIONS.find(p => p.value === linkProtocol)?.label || 'https://'}
        </button>
        {protocolDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50"
            style={{ minWidth: '100px' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {PROTOCOL_OPTIONS.map(protocol => (
              <button
                key={protocol.value}
                className={`bubble-dropdown-item text-sm ${
                  linkProtocol === protocol.value ? 'is-active' : ''
                }`}
                onClick={() => {
                  setLinkProtocol(protocol.value)
                  setProtocolDropdownOpen(false)
                }}
              >
                {protocol.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        ref={linkInputRef}
        type="text"
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setLink()
          if (e.key === 'Escape') {
            setShowLinkInput(false)
            setLinkUrl('')
          }
        }}
        placeholder={linkProtocol === 'local:' ? '输入本地文件路径...' : '输入链接地址...'}
        className="px-2 py-1 text-sm border-none outline-none w-48"
      />
      <button onClick={setLink} className="p-1 text-primary" title="确定">
        <Check className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          setShowLinkInput(false)
          setLinkUrl('')
          setLinkProtocol('https://')
        }}
        className="p-1 text-gray-500"
        title="取消"
      >
        <X className="w-4 h-4" />
      </button>
    </>
  )

  // 渲染图片菜单
  const renderImageMenu = () => {
    const imageNode = getSelectedImageNode()
    return (
      <>
        <button
          {...alignmentHandlers('left')}
          className={imageNode?.attrs.textAlign === 'left' ? 'is-active' : ''}
          title="左对齐"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          {...alignmentHandlers('center')}
          className={imageNode?.attrs.textAlign === 'center' ? 'is-active' : ''}
          title="居中"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          {...alignmentHandlers('right')}
          className={imageNode?.attrs.textAlign === 'right' ? 'is-active' : ''}
          title="右对齐"
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <div className="divider" />
        <button onClick={downloadImage} title="下载图片">
          <Download className="w-4 h-4" />
        </button>
      </>
    )
  }

  const renderCanvasMenu = () => {
    const node = getSelectedCanvasNode()
    return (
      <>
        <button onClick={editCanvas} title="编辑画布"><Pencil className="w-4 h-4" /></button>
        <div className="divider" />
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            {...alignmentHandlers(align)}
            className={node?.attrs.textAlign === align ? 'is-active' : ''}
            title={align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}
          >
            {align === 'left' ? <AlignLeft className="w-4 h-4" />
              : align === 'center' ? <AlignCenter className="w-4 h-4" />
                : <AlignRight className="w-4 h-4" />}
          </button>
        ))}
        <div className="divider" />
        <button onClick={() => void downloadCanvas()} title="下载画布"><Download className="w-4 h-4" /></button>
      </>
    )
  }

  // 渲染思维导图菜单
  const renderMindMapMenu = () => {
    const mindmapNode = getSelectedMindMapNode()
    return (
      <>
        <button onClick={editMindMap} title="编辑思维导图">
          <Pencil className="w-4 h-4" />
        </button>
        <div className="divider" />
        <button
          {...alignmentHandlers('left')}
          className={mindmapNode?.attrs.textAlign === 'left' ? 'is-active' : ''}
          title="左对齐"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          {...alignmentHandlers('center')}
          className={mindmapNode?.attrs.textAlign === 'center' ? 'is-active' : ''}
          title="居中"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          {...alignmentHandlers('right')}
          className={mindmapNode?.attrs.textAlign === 'right' ? 'is-active' : ''}
          title="右对齐"
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <div className="divider" />
        <button onClick={downloadMindMap} title="下载思维导图">
          <Download className="w-4 h-4" />
        </button>
      </>
    )
  }

  // 字体选择器
  const renderFontFamilyDropdown = () => {
    const currentFont = editor.getAttributes('textStyle').fontFamily || ''
    const currentLabel = FONT_OPTIONS.find(f => f.value === currentFont)?.label || '默认'

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setFontDropdownOpen(!fontDropdownOpen)
            setSizeDropdownOpen(false)
            setHeadingDropdownOpen(false)
            setColorDropdownOpen(false)
          }}
          className={`bubble-dropdown-trigger ${fontDropdownOpen ? 'is-active' : ''}`}
          style={DROPDOWN_TRIGGER_STYLE}
          title="字体"
        >
          <Type className="w-4 h-4" />
        </button>
        {fontDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50"
            style={{ minWidth: '120px', maxHeight: '300px', overflowY: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b">{currentLabel}</div>
            {FONT_OPTIONS.map(font => (
              <button
                key={font.value}
                className={`bubble-dropdown-item text-sm ${currentFont === font.value ? 'is-active' : ''}`}
                style={{ fontFamily: font.value || 'inherit' }}
                onClick={() => {
                  if (font.value) {
                    editor.chain().focus().setFontFamily(font.value).run()
                  } else {
                    editor.chain().focus().unsetFontFamily().run()
                  }
                  setFontDropdownOpen(false)
                }}
              >
                {font.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 字号选择器
  const renderFontSizeDropdown = () => {
    const currentSize = editor.getAttributes('textStyle').fontSize || '16px'
    const currentLabel = SIZE_OPTIONS.find(s => s.value === currentSize)?.label || '正常'

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSizeDropdownOpen(!sizeDropdownOpen)
            setFontDropdownOpen(false)
            setHeadingDropdownOpen(false)
            setColorDropdownOpen(false)
          }}
          className={`bubble-dropdown-trigger ${sizeDropdownOpen ? 'is-active' : ''}`}
          style={DROPDOWN_TRIGGER_STYLE}
          title="字号"
        >
          <ALargeSmall className="w-4 h-4" />
        </button>
        {sizeDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50"
            style={{ minWidth: '100px' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b">{currentLabel}</div>
            {SIZE_OPTIONS.map(size => (
              <button
                key={size.value}
                className={`bubble-dropdown-item text-sm ${currentSize === size.value ? 'is-active' : ''}`}
                onClick={() => {
                  editor.chain().focus().setFontSize(size.value).run()
                  setSizeDropdownOpen(false)
                }}
              >
                {size.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 标题选择器（优化：一次 getAttributes 替代 6 次 isActive）
  const renderHeadingDropdown = () => {
    const headingAttrs = editor.getAttributes('heading')
    const currentLevel = headingAttrs.level || 0
    const currentLabel = HEADING_OPTIONS.find(h => h.value === currentLevel)?.label || '正文'

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setHeadingDropdownOpen(!headingDropdownOpen)
            setFontDropdownOpen(false)
            setSizeDropdownOpen(false)
            setColorDropdownOpen(false)
          }}
          className={`bubble-dropdown-trigger ${headingDropdownOpen ? 'is-active' : ''}`}
          style={DROPDOWN_TRIGGER_STYLE}
          title="标题"
        >
          <Heading className="w-4 h-4" />
        </button>
        {headingDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50"
            style={{ minWidth: '120px' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b">{currentLabel}</div>
            {HEADING_OPTIONS.map(heading => (
              <button
                key={heading.value}
                className={`bubble-dropdown-item text-sm ${currentLevel === heading.value ? 'is-active' : ''}`}
                onClick={() => {
                  if (heading.value === 0) {
                    editor.chain().focus().setParagraph().run()
                  } else {
                    editor.chain().focus().toggleHeading({ level: heading.value as 1 | 2 | 3 | 4 | 5 | 6 }).run()
                  }
                  setHeadingDropdownOpen(false)
                }}
              >
                {heading.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 字体颜色选择器
  const renderColorDropdown = () => {
    const currentColor = editor.getAttributes('textStyle').color || ''
    const currentLabel = COLOR_OPTIONS.find(c => c.value === currentColor)?.label || '默认'

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setColorDropdownOpen(!colorDropdownOpen)
            setFontDropdownOpen(false)
            setSizeDropdownOpen(false)
            setHeadingDropdownOpen(false)
          }}
          className={`bubble-dropdown-trigger ${colorDropdownOpen ? 'is-active' : ''}`}
          style={{ ...DROPDOWN_TRIGGER_STYLE, position: 'relative' }}
          title="字体颜色"
        >
          <Palette className="w-4 h-4" />
          {currentColor && (
            <span
              className="absolute bottom-0 left-1/2 -translate-x-1/2"
              style={{ width: '12px', height: '3px', backgroundColor: currentColor, borderRadius: '1px' }}
            />
          )}
        </button>
        {colorDropdownOpen && (
          <div
            className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50 p-2"
            style={{ minWidth: '140px' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-1 py-1 text-xs text-gray-500 border-b mb-2">{currentLabel}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color.value}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                    currentColor === color.value ? 'border-blue-500' : 'border-gray-200'
                  }`}
                  style={{
                    backgroundColor: color.value || '#FFFFFF',
                    ...(color.value === '' ? {
                      backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px'
                    } : {})
                  }}
                  title={color.label}
                  onClick={() => {
                    if (color.value) {
                      editor.chain().focus().setColor(color.value).run()
                    } else {
                      editor.chain().focus().unsetColor().run()
                    }
                    setColorDropdownOpen(false)
                  }}
                >
                  {currentColor === color.value && (
                    <Check className="w-3 h-3" style={{ color: color.value ? 'white' : '#333' }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 渲染文本菜单
  const renderTextMenu = () => (
    <>
      {renderFontFamilyDropdown()}
      {renderFontSizeDropdown()}
      {renderHeadingDropdown()}
      {renderColorDropdown()}

      <div className="divider" />

      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
        title="加粗"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="斜体"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="删除线"
      >
        <Strikethrough className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
          } else {
            setShowLinkInput(true)
            parseExistingHref(editor.getAttributes('link').href || '')
          }
        }}
        className={editor.isActive('link') ? 'is-active' : ''}
        title="链接"
      >
        <LinkIcon className="w-4 h-4" />
      </button>

      <div className="divider" />

      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
        title="左对齐"
      >
        <AlignLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
        title="居中"
      >
        <AlignCenter className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
        title="右对齐"
      >
        <AlignRight className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        className={editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}
        title="两端对齐"
      >
        <AlignJustify className="w-4 h-4" />
      </button>

      <div className="divider" />

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
        <Sparkles className="w-4 h-4" />
      </button>
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
        <Expand className="w-4 h-4" />
      </button>
    </>
  )

  const renderMenuContent = () => {
    if (showLinkInput) return renderLinkInput()
    if (isCanvasSelected()) return renderCanvasMenu()
    if (isMindMapSelected()) return renderMindMapMenu()
    if (isImageSelected()) return renderImageMenu()
    return renderTextMenu()
  }

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={0}
      tippyOptions={{
        duration: 0,
        maxWidth: 'none',
        ...(hidden && { getReferenceClientRect: null })
      }}
      shouldShow={({ state }) => {
        if (hidden) return false
        const { selection } = state
        if (selection instanceof CellSelection) return false
        const node = (selection as NodeSelection).node
        if (node?.type.name === 'mindmapReference' || node?.type.name === 'canvasReference') return true
        if (node?.type.name === 'image' || node?.type.name === 'assetImage') return true
        if (selection.$anchor.parent.type.name === 'image' || selection.$anchor.parent.type.name === 'assetImage') return true
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
