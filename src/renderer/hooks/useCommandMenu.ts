import { useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'

interface CommandMenuState {
  showCommandMenu: boolean
  commandMenuPos: { x: number; y: number }
  searchQuery: string
}

interface UseCommandMenuOptions {
  onSelectImage?: () => Promise<{ data: string } | null>
  onCreateCanvas?: () => void
}

export function useCommandMenu(editor: Editor | null, options: UseCommandMenuOptions = {}) {
  const [state, setState] = useState<CommandMenuState>({
    showCommandMenu: false,
    commandMenuPos: { x: 0, y: 0 },
    searchQuery: '',
  })

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }))
  }, [])

  const openCommandMenu = useCallback((pos: { x: number; y: number }) => {
    setState({
      showCommandMenu: true,
      commandMenuPos: pos,
      searchQuery: '',
    })
  }, [])

  const closeCommandMenu = useCallback(() => {
    setState(prev => ({ ...prev, showCommandMenu: false }))
  }, [])

  /**
   * 编辑器键盘事件处理函数
   * 返回 true 表示已处理事件，false 表示未处理
   */
  const handleKeyDown = useCallback((view: any, event: KeyboardEvent): boolean => {
    // 检测 \ 键 或 Alt 键呼出命令菜单
    if (event.key === '\\' || event.key === 'Alt') {
      event.preventDefault()
      const { from } = view.state.selection
      const coords = view.coordsAtPos(from)
      openCommandMenu({ x: coords.left, y: coords.bottom + 5 })
      return true
    }
    // Escape 关闭命令菜单
    if (event.key === 'Escape' && state.showCommandMenu) {
      closeCommandMenu()
      return true
    }
    return false
  }, [state.showCommandMenu, openCommandMenu, closeCommandMenu])

  /**
   * 命令菜单选择处理
   */
  const handleCommandSelect = useCallback(async (command: string) => {
    closeCommandMenu()
    
    if (!editor) return

    switch (command) {
      case 'h1':
        editor.chain().focus().toggleHeading({ level: 1 }).run()
        break
      case 'h2':
        editor.chain().focus().toggleHeading({ level: 2 }).run()
        break
      case 'h3':
        editor.chain().focus().toggleHeading({ level: 3 }).run()
        break
      case 'h4':
        editor.chain().focus().toggleHeading({ level: 4 }).run()
        break
      case 'h5':
        editor.chain().focus().toggleHeading({ level: 5 }).run()
        break
      case 'h6':
        editor.chain().focus().toggleHeading({ level: 6 }).run()
        break
      case 'bullet':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'ordered':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'task':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'quote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'code':
        editor.chain().focus().toggleCodeBlock().run()
        break
      case 'divider':
        editor.chain().focus().setHorizontalRule().run()
        break
      case 'image':
        if (options.onSelectImage) {
          const result = await options.onSelectImage()
          if (result) {
            editor.chain().focus().setImage({ src: result.data }).run()
          }
        }
        break
      case 'canvas':
        if (options.onCreateCanvas) {
          options.onCreateCanvas()
        }
        break
    }
  }, [editor, options, closeCommandMenu])

  return {
    showCommandMenu: state.showCommandMenu,
    commandMenuPos: state.commandMenuPos,
    searchQuery: state.searchQuery,
    setSearchQuery,
    openCommandMenu,
    closeCommandMenu,
    handleCommandSelect,
    handleKeyDown,
  }
}
