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
        throw new Error(result.error.message)
      }
      setEditingMindMap((current) => current?.error ? { ...current, error: null } : current)
    } else {
      const result = await window.electronAPI.knowledge.createMindMap(vaultId, documentId, content)
      if (!result.ok) {
        setEditingMindMap((current) => current ? { ...current, error: result.error.message } : null)
        throw new Error(result.error.message)
      }
      // The document selection is preserved while the modal is open; inserting
      // must not steal focus from the active mind-map action.
      editor.chain().insertContent({
        type: 'mindmapReference',
        attrs: { mindmapId: result.data.id, width: null, textAlign: 'left' },
      }).run()
      // Keep the current editor instance alive. Its native data is the draft
      // source of truth; only adopt the newly allocated resource ID here.
      setEditingMindMap((current) => current ? { ...current, id: result.data.id, error: null } : null)
    }
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
