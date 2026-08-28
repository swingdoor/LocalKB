import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { MindMapData } from '@shared/knowledge-types'

interface EditingMindMap {
  id: string | null
  data: MindMapData | null
  loading: boolean
  error: string | null
}

export function useMindMapEdit(editor: Editor | null, vaultId: string, documentId: string) {
  const [editingMindMap, setEditingMindMap] = useState<EditingMindMap | null>(null)

  const createMindMap = useCallback(() => {
    setEditingMindMap({ id: null, data: null, loading: false, error: null })
  }, [])

  const handleEditMindMap = useCallback(async (mindmapId: string) => {
    setEditingMindMap({ id: mindmapId, data: null, loading: true, error: null })
    const result = await window.electronAPI.knowledge.getMindMap(vaultId, documentId, mindmapId)
    if (!result.ok) {
      setEditingMindMap({ id: mindmapId, data: null, loading: false, error: result.error.message })
      return
    }
    setEditingMindMap({ id: mindmapId, data: result.data, loading: false, error: null })
  }, [documentId, vaultId])

  const handleSaveMindMap = useCallback(async (content: MindMapData) => {
    if (!editor || !editingMindMap) return
    if (editingMindMap.id) {
      const result = await window.electronAPI.knowledge.replaceMindMap(
        vaultId, documentId, editingMindMap.id, content,
      )
      if (!result.ok) {
        setEditingMindMap((current) => current ? { ...current, error: result.error.message } : null)
        return
      }
    } else {
      const result = await window.electronAPI.knowledge.createMindMap(vaultId, documentId, content)
      if (!result.ok) {
        setEditingMindMap((current) => current ? { ...current, error: result.error.message } : null)
        return
      }
      editor.chain().focus().insertContent({
        type: 'mindmapReference',
        attrs: { mindmapId: result.data.id, width: null, textAlign: 'left' },
      }).run()
    }
    setEditingMindMap(null)
  }, [documentId, editingMindMap, editor, vaultId])

  const closeMindMapEditor = useCallback(() => setEditingMindMap(null), [])

  return {
    editingMindMap,
    createMindMap,
    handleSaveMindMap,
    handleEditMindMap,
    closeMindMapEditor,
  }
}
