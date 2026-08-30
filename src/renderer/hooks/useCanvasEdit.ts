import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { ExcalidrawScene } from '@shared/knowledge-types'
import { insertManagedResourceReference } from '../editor/insertManagedResource'

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
    const result = await window.electronAPI.knowledge.getCanvas(vaultId, canvasId)
    if (!result.ok) {
      setEditingCanvas({ id: canvasId, data: null, loading: false, error: result.error.message })
      return
    }
    setEditingCanvas({
      id: canvasId, data: result.data as ExcalidrawScene, loading: false, error: null,
    })
  }, [vaultId])

  const handleSaveCanvas = useCallback(async (content: ExcalidrawScene) => {
    if (!editor || !editingCanvas) return
    if (editingCanvas.id) {
      const result = await window.electronAPI.knowledge.replaceCanvas(
        vaultId, editingCanvas.id, content,
      )
      if (!result.ok) {
        setEditingCanvas((current) => current ? { ...current, error: result.error.message } : null)
        return
      }
    } else {
      const resourceId = crypto.randomUUID()
      const result = await insertManagedResourceReference(
        editor.view,
        vaultId,
        documentId,
        { resourceType: 'canvas', resourceId, content },
        'canvasReference',
        { canvasId: resourceId, width: null, textAlign: 'left' },
      )
      if (!result.ok) {
        setEditingCanvas((current) => current ? { ...current, error: result.error.message } : null)
        return
      }
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
