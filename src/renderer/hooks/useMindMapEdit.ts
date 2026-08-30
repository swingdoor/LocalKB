import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { MindMapData } from '@shared/knowledge-types'
import { insertManagedResourceReference } from '../editor/insertManagedResource'

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
    const result = await window.electronAPI.knowledge.getMindMap(vaultId, mindmapId)
    if (!result.ok) {
      setEditingMindMap({ id: mindmapId, data: null, loading: false, error: result.error.message })
      return
    }
    setEditingMindMap({ id: mindmapId, data: result.data, loading: false, error: null })
  }, [vaultId])

  const handleSaveMindMap = useCallback(async (content: MindMapData) => {
    if (!editor || !editingMindMap) return
    if (editingMindMap.id) {
      const result = await window.electronAPI.knowledge.replaceMindMap(
        vaultId, editingMindMap.id, content,
      )
      if (!result.ok) {
        setEditingMindMap((current) => current ? { ...current, error: result.error.message } : null)
        throw new Error(result.error.message)
      }
      setEditingMindMap((current) => current?.error ? { ...current, error: null } : current)
    } else {
      const resourceId = crypto.randomUUID()
      const result = await insertManagedResourceReference(
        editor.view,
        vaultId,
        documentId,
        { resourceType: 'mindmap', resourceId, content },
        'mindmapReference',
        { mindmapId: resourceId, width: null, textAlign: 'left' },
      )
      if (!result.ok) {
        setEditingMindMap((current) => current ? { ...current, error: result.error.message } : null)
        throw new Error(result.error.message)
      }
      // Keep the current editor instance alive. Its native data is the draft
      // source of truth; only adopt the newly allocated resource ID here.
      setEditingMindMap((current) => current ? { ...current, id: resourceId, error: null } : null)
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
