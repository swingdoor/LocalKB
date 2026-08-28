import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { ExcalidrawScene } from '@shared/knowledge-types'

interface EditingCanvas {
  id: string | null
  data: ExcalidrawScene | null
  loading: boolean
  error: string | null
}

export function useCanvasEdit(editor: Editor | null, vaultId: string, documentId: string) {
  const [editingCanvas, setEditingCanvas] = useState<EditingCanvas | null>(null)

  const createCanvas = useCallback(() => {
    setEditingCanvas({ id: null, data: null, loading: false, error: null })
  }, [])

  const handleEditCanvas = useCallback(async (canvasId: string) => {
    setEditingCanvas({ id: canvasId, data: null, loading: true, error: null })
    const result = await window.electronAPI.knowledge.getCanvas(vaultId, canvasId, documentId)
    if (!result.ok) {
      setEditingCanvas({ id: canvasId, data: null, loading: false, error: result.error.message })
      return
    }
    setEditingCanvas({
      id: canvasId, data: result.data as ExcalidrawScene, loading: false, error: null,
    })
  }, [documentId, vaultId])

  const handleSaveCanvas = useCallback(async (content: ExcalidrawScene) => {
    if (!editor || !editingCanvas) return
    if (editingCanvas.id) {
      const result = await window.electronAPI.knowledge.replaceCanvas(
        vaultId, editingCanvas.id, content, documentId,
      )
      if (!result.ok) {
        setEditingCanvas((current) => current ? { ...current, error: result.error.message } : null)
        return
      }
    } else {
      const result = await window.electronAPI.knowledge.createEmbeddedCanvas(
        vaultId, documentId, content,
      )
      if (!result.ok) {
        setEditingCanvas((current) => current ? { ...current, error: result.error.message } : null)
        return
      }
      editor.chain().focus().insertContent({
        type: 'canvasReference',
        attrs: { canvasId: result.data.id, width: null, textAlign: 'left' },
      }).run()
    }
    setEditingCanvas(null)
  }, [documentId, editingCanvas, editor, vaultId])

  const closeCanvasEditor = useCallback(() => setEditingCanvas(null), [])

  return {
    editingCanvas,
    createCanvas,
    handleSaveCanvas,
    handleEditCanvas,
    closeCanvasEditor,
  }
}
