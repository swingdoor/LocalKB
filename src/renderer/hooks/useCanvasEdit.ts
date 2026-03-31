import { useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'

interface EditingCanvas {
  id: string
  data: string
  isEditing?: boolean
}

export function useCanvasEdit(editor: Editor | null) {
  const [editingCanvas, setEditingCanvas] = useState<EditingCanvas | null>(null)

  /**
   * 创建新画布
   */
  const createCanvas = useCallback(() => {
    setEditingCanvas({ id: `canvas-${Date.now()}`, data: '' })
  }, [])

  /**
   * 保存画布
   * 将 Excalidraw 数据编码存储在 title 属性中
   */
  const handleSaveCanvas = useCallback((imageData: string, excalidrawData: string) => {
    if (!editor || !editingCanvas) return

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

    setEditingCanvas(null)
  }, [editor, editingCanvas])

  /**
   * 编辑已有画布
   */
  const handleEditCanvas = useCallback((canvasId: string, _imageData: string) => {
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
  }, [editor])

  /**
   * 关闭画布编辑器
   */
  const closeCanvasEditor = useCallback(() => {
    setEditingCanvas(null)
  }, [])

  return {
    editingCanvas,
    createCanvas,
    handleSaveCanvas,
    handleEditCanvas,
    closeCanvasEditor,
  }
}
