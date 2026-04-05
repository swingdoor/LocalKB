import React, { useState, useEffect, useRef, useMemo } from 'react'

interface CommandMenuProps {
  position: { x: number; y: number }
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelect: (command: string) => void
  onClose: () => void
}

interface CommandItem {
  id: string
  title: string
  icon: React.ReactNode
  shortcut?: string
}

const commands: CommandItem[] = [
  {
    id: 'heading',
    title: '标题',
    icon: <span className="text-xs font-bold">H</span>,
    shortcut: 'H1-H6',
  },
  {
    id: 'bullet',
    title: '无序列表',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    shortcut: 'Ctrl+Shift+8',
  },
  {
    id: 'ordered',
    title: '有序列表',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M4 8h.01M4 12h.01M4 16h.01" />
      </svg>
    ),
    shortcut: 'Ctrl+Shift+7',
  },
  {
    id: 'task',
    title: '待办事项',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'quote',
    title: '引用',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    shortcut: 'Ctrl+Shift+B',
  },
  {
    id: 'code',
    title: '代码块',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    shortcut: 'Ctrl+Alt+C',
  },
  {
    id: 'divider',
    title: '分割线',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    ),
  },
  {
    id: 'image',
    title: '图片',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    shortcut: 'Ctrl+Shift+I',
  },
  {
    id: 'canvas',
    title: '画布',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    shortcut: 'Ctrl+Shift+P',
  },
]

function CommandMenu({
  position,
  searchQuery,
  onSearchChange,
  onSelect,
  onClose,
}: CommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showAbove, setShowAbove] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 过滤命令（搜索有结果时隐藏标题行）
  const filteredCommands = useMemo(() => {
    const hasSearchQuery = searchQuery.trim().length > 0
    return commands.filter(
      (cmd) => !hasSearchQuery || cmd.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery])

  // 可导航的索引（排除标题行）
  const navigableIndices = useMemo(() => {
    return filteredCommands
      .map((cmd, i) => cmd.id !== 'heading' ? i : -1)
      .filter(i => i !== -1)
  }, [filteredCommands])

  // 计算菜单位置
  useEffect(() => {
    const menuHeight = 400
    const windowHeight = window.innerHeight
    const spaceBelow = windowHeight - position.y
    if (spaceBelow < menuHeight && position.y > menuHeight) {
      setShowAbove(true)
    } else {
      setShowAbove(false)
    }
  }, [position])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          if (navigableIndices.length === 0) break
          const currentUpIdx = navigableIndices.indexOf(selectedIndex)
          const nextUp = currentUpIdx <= 0 ? navigableIndices[navigableIndices.length - 1] : navigableIndices[currentUpIdx - 1]
          setSelectedIndex(nextUp)
          break
        case 'ArrowDown':
          e.preventDefault()
          if (navigableIndices.length === 0) break
          const currentDownIdx = navigableIndices.indexOf(selectedIndex)
          const nextDown = currentDownIdx >= navigableIndices.length - 1 ? navigableIndices[0] : navigableIndices[currentDownIdx + 1]
          setSelectedIndex(nextDown)
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex] && filteredCommands[selectedIndex].id !== 'heading') {
            onSelect(filteredCommands[selectedIndex].id)
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredCommands, navigableIndices, selectedIndex, onSelect, onClose])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // 自动聚焦输入框
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="command-menu"
      style={{
        left: position.x,
        ...(showAbove
          ? { bottom: window.innerHeight - position.y + 10 }
          : { top: position.y }
        ),
      }}
    >
      {/* 搜索输入 */}
      <div className="p-2 border-b border-border">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
          placeholder="搜索命令..."
          className="w-full px-2 py-1 text-sm bg-gray-50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* 命令列表 */}
      <div className="py-1 max-h-80 overflow-y-auto">
        {filteredCommands.length > 0 ? (
          filteredCommands.map((cmd, index) => (
            <div key={cmd.id}>
              {cmd.id === 'heading' ? (
                <div className="heading-row">
                  {[1, 2, 3, 4, 5, 6].map(level => (
                    <button
                      key={level}
                      className="heading-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(`h${level}`)
                      }}
                    >
                      H{level}
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => onSelect(cmd.id)}
                  className={`command-menu-item-compact ${index === selectedIndex ? 'selected' : ''}`}
                >
                  <div className="icon">{cmd.icon}</div>
                  <span className="title">{cmd.title}</span>
                  {cmd.shortcut && (
                    <kbd className="command-shortcut">{cmd.shortcut}</kbd>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="px-3 py-3 text-center text-sm text-gray-400">
            未找到匹配的命令
          </div>
        )}
      </div>
    </div>
  )
}

export default CommandMenu
