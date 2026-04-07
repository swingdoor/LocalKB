import { useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'

interface EditingMindMap {
  id: string
  data: string
  isEditing?: boolean
}

export function useMindMapEdit(editor: Editor | null) {
  const [editingMindMap, setEditingMindMap] = useState<EditingMindMap | null>(null)

  /**
   * Create new mind map
   */
  const createMindMap = useCallback(() => {
    setEditingMindMap({ id: `mindmap-${Date.now()}`, data: '' })
  }, [])

  /**
   * Save mind map
   */
  const handleSaveMindMap = useCallback((data: string) => {
    if (!editor || !editingMindMap) return

    const jsonData = data

    if (editingMindMap.isEditing) {
      // Update existing mind map
      const { state } = editor
      let foundPos: number | null = null

      state.doc.descendants((node, pos) => {
        if (node.type.name === 'mindmap' && node.attrs.alt === editingMindMap.id) {
          foundPos = pos
          return false
        }
        return true
      })

      if (foundPos !== null) {
        editor.chain().focus()
          .setNodeSelection(foundPos)
          .setMindMap({ data: jsonData, alt: editingMindMap.id })
          .run()
      }
    } else {
      // Insert new mind map
      editor.chain().focus().setMindMap({
        data: jsonData,
        alt: editingMindMap.id,
      }).run()
    }

    setEditingMindMap(null)
  }, [editor, editingMindMap])

  /**
   * Edit existing mind map
   */
  const handleEditMindMap = useCallback((mindmapId: string) => {
    if (!editor) return

    const { state } = editor
    let mindmapData = ''

    state.doc.descendants((node) => {
      if (node.type.name === 'mindmap' && node.attrs.alt === mindmapId && node.attrs.data) {
        mindmapData = node.attrs.data
        return false
      }
      return true
    })

    setEditingMindMap({ id: mindmapId, data: mindmapData, isEditing: true })
  }, [editor])

  /**
   * Close editor
   */
  const closeMindMapEditor = useCallback(() => {
    setEditingMindMap(null)
  }, [])

  return {
    editingMindMap,
    createMindMap,
    handleSaveMindMap,
    handleEditMindMap,
    closeMindMapEditor,
  }
}
