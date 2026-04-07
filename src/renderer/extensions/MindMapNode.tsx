import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

// Mind map node view component - shows SVG preview with resize handles
const MindMapNodeView = ({ node, updateAttributes, selected }: any) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startWidth, setStartWidth] = useState(0)

  const { data, alt, width, textAlign } = node.attrs

  let svgPreview = ''
  let hasValidData = false

  if (data) {
    try {
      const parsed = JSON.parse(data)
      if (parsed.svg) {
        svgPreview = parsed.svg
        hasValidData = true
      }
    } catch {
      hasValidData = false
    }
  }

  const alignStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
  }

  // Handle resize - same logic as ResizableImage
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setStartX(e.clientX)
    setStartWidth(containerRef.current?.offsetWidth || 0)
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

  if (!hasValidData) {
    return (
      <NodeViewWrapper style={alignStyle}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: width ? `${width}px` : '100%',
            minHeight: '150px',
            backgroundColor: 'var(--bg-secondary, #f5f5f5)',
            borderRadius: '8px',
            color: 'var(--text-secondary, #666)',
            fontSize: '14px',
          }}
        >
          思维导图（空）
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper style={alignStyle}>
      <div
        ref={containerRef}
        className={`mindmap-node-wrapper ${selected ? 'selected' : ''}`}
        style={{
          position: 'relative',
          display: 'inline-block',
          width: width ? `${width}px` : 'auto',
        }}
      >
        <img
          src={svgPreview}
          alt={alt || '思维导图'}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '4px',
          }}
          draggable={false}
        />
        
        {/* Resize handles - show when selected, same as ResizableImage */}
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
      </div>
    </NodeViewWrapper>
  )
}

// TipTap node extension
export const MindMapNode = Node.create({
  name: 'mindmap',

  group: 'block',

  draggable: true,

  addAttributes() {
    return {
      data: {
        default: null,
      },
      alt: {
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
        tag: 'div[data-mindmap]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { width, textAlign, ...attrs } = HTMLAttributes
    const style = []
    if (width) {
      style.push(`width: ${width}px`)
    }
    return ['div', mergeAttributes({ 'data-mindmap': 'true' }, attrs, { style: style.join('; ') })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MindMapNodeView)
  },

  addCommands() {
    return {
      setMindMap:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          })
        },
      setMindMapAlign:
        (align) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          const node = (selection as any).node
          
          if (node?.type.name === 'mindmap') {
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

export default MindMapNode
