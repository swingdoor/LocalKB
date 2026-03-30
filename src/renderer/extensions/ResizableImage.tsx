import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

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
const ResizableImageComponent = ({ node, updateAttributes, selected }: any) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startWidth, setStartWidth] = useState(0)

  const { src, alt, title, width, textAlign } = node.attrs

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setStartX(e.clientX)
    setStartWidth(imgRef.current?.offsetWidth || 0)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const diff = e.clientX - startX
      const newWidth = Math.max(100, startWidth + diff)
      updateAttributes({ width: newWidth })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, startX, startWidth, updateAttributes])

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
          width: width ? `${width}px` : 'auto',
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          title={title || ''}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '4px',
          }}
          draggable={false}
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
export const ResizableImage = Node.create({
  name: 'image',

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    }
  },

  inline() {
    return this.options.inline
  },

  group() {
    return this.options.inline ? 'inline' : 'block'
  },

  draggable: true,

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
