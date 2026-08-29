import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorInteractionCoordinator } from '../editor/interactionContext'

interface ResizableImageOptions {
  inline: boolean
  allowBase64: boolean
  HTMLAttributes: Record<string, unknown>
  interaction?: EditorInteractionCoordinator
}

// 声明命令类型
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: { src: string; alt?: string; title?: string; width?: number }) => ReturnType
      setImageAlign: (align: 'left' | 'center' | 'right') => ReturnType
    }
  }
}

// 可调整大小的图片组件
const ResizableImageComponent = ({ node, updateAttributes, selected, extension }: any) => {
  const options = extension.options as ResizableImageOptions
  const imgRef = useRef<HTMLImageElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startWidth, setStartWidth] = useState(0)
  const [draftWidth, setDraftWidth] = useState<number | null>(node.attrs.width ?? null)
  const draftWidthRef = useRef<number | null>(node.attrs.width ?? null)

  const { src, alt, title, width, textAlign } = node.attrs

  // 判断是否是画布（画布的 title 属性是 base64 编码的 Excalidraw 数据）
  const isCanvas = title && title.length > 100

  useEffect(() => {
    if (isResizing) return
    const nextWidth = typeof width === 'number' ? width : null
    draftWidthRef.current = nextWidth
    setDraftWidth(nextWidth)
  }, [isResizing, width])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setStartX(e.clientX)
    const measuredWidth = imgRef.current?.offsetWidth || 0
    setStartWidth(measuredWidth)
    draftWidthRef.current = measuredWidth
    setDraftWidth(measuredWidth)
    options.interaction?.beginGesture('nodeResizing', 'image')
  }, [options.interaction])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const diff = e.clientX - startX
      const newWidth = Math.max(100, startWidth + diff)
      draftWidthRef.current = newWidth
      setDraftWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      options.interaction?.endGesture('nodeResizing')
      if (draftWidthRef.current !== null) updateAttributes({ width: Math.round(draftWidthRef.current) })
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, options.interaction, startX, startWidth, updateAttributes])

  useEffect(() => () => options.interaction?.endGesture('nodeResizing'), [options.interaction])

  const alignStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
  }

  return (
    <NodeViewWrapper style={alignStyle}>
      <div
        className={`resizable-image-wrapper ${selected ? 'selected' : ''}`}
        style={{ 
          position: 'relative', 
          display: 'inline-block',
          width: draftWidth ? `${draftWidth}px` : 'auto',
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          title={isCanvas ? '' : (title || '')}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '4px',
          }}
          draggable={false}
          onDragStart={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        />
        
        {/* 调整大小的手柄 */}
        {selected && (
          <>
            {/* 右下角手柄 */}
            <div
              className="resize-handle resize-handle-se"
              onMouseDown={handleMouseDown}
              style={{
                position: 'absolute',
                right: -6,
                bottom: -6,
                width: 12,
                height: 12,
                background: '#2563EB',
                border: '2px solid white',
                borderRadius: 2,
                cursor: 'se-resize',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
            {/* 右侧中间手柄 */}
            <div
              className="resize-handle resize-handle-e"
              onMouseDown={handleMouseDown}
              style={{
                position: 'absolute',
                right: -6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 12,
                height: 24,
                background: '#2563EB',
                border: '2px solid white',
                borderRadius: 2,
                cursor: 'e-resize',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// 自定义可调整大小的图片扩展
export const ResizableImage = Node.create<ResizableImageOptions>({
  name: 'image',

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
      interaction: undefined,
    }
  },

  inline() {
    return this.options.inline
  },

  group() {
    return this.options.inline ? 'inline' : 'block'
  },

  draggable: false,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
      },
      textAlign: {
        default: 'left',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { width, textAlign, ...attrs } = HTMLAttributes
    const style = []
    if (width) {
      style.push(`width: ${width}px`)
    }
    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs, { style: style.join('; ') })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent)
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          })
        },
      setImageAlign:
        (align) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          const node = (selection as any).node
          
          if (node?.type.name === 'image') {
            if (dispatch) {
              tr.setNodeMarkup(selection.from, undefined, {
                ...node.attrs,
                textAlign: align,
              })
              dispatch(tr)
            }
            return true
          }
          return false
        },
    }
  },
})

export default ResizableImage
