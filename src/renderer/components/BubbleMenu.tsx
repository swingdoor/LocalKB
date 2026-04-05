import { useState, useEffect, useCallback } from 'react'
import { BubbleMenu, Editor } from '@tiptap/react'
import type { NodeSelection } from '@tiptap/pm/state'

interface BubbleMenuProps {
  editor: Editor
  onEditCanvas?: (canvasId: string, imageData: string) => void
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

function EditorBubbleMenu({ editor, onEditCanvas, onPolish, onExpand, hidden = false }: BubbleMenuProps) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkProtocol, setLinkProtocol] = useState('https://')
  const [protocolDropdownOpen, setProtocolDropdownOpen] = useState(false)
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false)
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false)
  const [headingDropdownOpen, setHeadingDropdownOpen] = useState(false)
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false)

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

  // 获取选中的图片节点（使用正确的 NodeSelection 类型）
  const getSelectedImageNode = useCallback(() => {
    const { selection } = editor.state
    const node = (selection as NodeSelection).node
    if (node?.type.name === 'image') {
      return node
    }
    if (selection.$anchor.parent.type.name === 'image') {
      return selection.$anchor.parent
    }
    return null
  }, [editor.state])

  // 判断是否选中图片
  const isImageSelected = useCallback(() => {
    return getSelectedImageNode() !== null
  }, [getSelectedImageNode])

  // 判断是否选中画布
  const isCanvasSelected = useCallback(() => {
    const node = getSelectedImageNode()
    return node?.type.name === 'image' && node.attrs.alt?.startsWith('canvas-')
  }, [getSelectedImageNode])

  // 下载图片
  const downloadImage = useCallback(async () => {
    const node = getSelectedImageNode()
    if (node?.attrs.src) {
      if (node.attrs.title) {
        try {
          const excalidrawData = JSON.parse(decodeURIComponent(atob(node.attrs.title)))
          const { exportToBlob } = await import('@excalidraw/excalidraw')
          const blob = await exportToBlob({
            elements: excalidrawData.elements,
            appState: { ...excalidrawData.appState, exportBackground: true },
            files: excalidrawData.files,
            exportPadding: 20,
            quality: 1,
            mimeType: 'image/png',
            getDimensions: (width: number, height: number) => ({
              width: width * 4,
              height: height * 4,
              scale: 4,
            }),
          })
          const reader = new FileReader()
          reader.onloadend = async () => {
            await window.electronAPI.file.downloadImage(reader.result as string, '画布.png')
          }
          reader.readAsDataURL(blob)
          return
        } catch (e) {
          console.error('导出画布PNG失败:', e)
        }
      }
      await window.electronAPI.file.downloadImage(node.attrs.src, 'image.png')
    }
  }, [getSelectedImageNode])

  // 编辑画布
  const editCanvas = useCallback(() => {
    const node = getSelectedImageNode()
    if (node?.type.name === 'image' && node.attrs.alt?.startsWith('canvas-')) {
      onEditCanvas?.(node.attrs.alt, node.attrs.src || '')
    }
  }, [getSelectedImageNode, onEditCanvas])

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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </>
  )

  // 渲染图片菜单
  const renderImageMenu = () => {
    const isCanvas = isCanvasSelected()
    return (
      <>
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
        <button onClick={downloadImage} title="下载图片">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 6v12M17 6v12M7 12h10" />
          </svg>
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 20v-4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
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

  // 标题选择器
  const renderHeadingDropdown = () => {
    let currentLevel = 0
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) {
        currentLevel = i
        break
      }
    }
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
          </svg>
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V7a4 4 0 014-4h10a4 4 0 014 4v10a4 4 0 01-4 4M7 21l4-4m0 0l4 4m-4-4v-16" />
          </svg>
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
                    <svg className="w-3 h-3" fill={color.value ? 'white' : '#333'} viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
        title="斜体"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h4m-2 0v16m4-16h-4m4 16h-4" transform="skewX(-10)" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'is-active' : ''}
        title="删除线"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.5 12h-11M12 7.5c-2.5 0-4 1.5-4 3 0 2 2.5 2.5 4 3s4 1 4 3c0 1.5-1.5 3-4 3" />
        </svg>
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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>

      <div className="divider" />

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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </>
  )

  const renderMenuContent = () => {
    if (showLinkInput) return renderLinkInput()
    if (isImageSelected()) return renderImageMenu()
    return renderTextMenu()
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        maxWidth: 'none',
        ...(hidden && { getReferenceClientRect: null })
      }}
      shouldShow={({ state }) => {
        if (hidden) return false
        const { selection } = state
        const node = (selection as NodeSelection).node
        if (node?.type.name === 'image') return true
        if (selection.$anchor.parent.type.name === 'image') return true
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
