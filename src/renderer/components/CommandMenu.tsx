import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'

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

interface NavItem {
  id: string          // 实际命令 id (h1-h6, bullet, ordered...)
  type: 'heading' | 'command'
  headingLevel?: number  // 1-6
}

const baseCommands: CommandItem[] = [
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
  {
    id: 'mindmap',
    title: '思维导图',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
    shortcut: 'Ctrl+Shift+M',
  },
]

// 构建扁平导航序列：H1-H6 + 其他命令
function buildNavItems(): NavItem[] {
  const headings: NavItem[] = [1, 2, 3, 4, 5, 6].map(level => ({
    id: `h${level}`,
    type: 'heading' as const,
    headingLevel: level,
  }))
  const commands: NavItem[] = baseCommands.map(cmd => ({
    id: cmd.id,
    type: 'command' as const,
  }))
  return [...headings, ...commands]
}

// 命令映射（用于搜索过滤）
const commandMap = new Map<string, CommandItem>(baseCommands.map(c => [c.id, c]))
const headingMap = new Map<number, CommandItem>(
  [1, 2, 3, 4, 5, 6].map(level => [
    level,
    { id: `h${level}`, title: `H${level}`, icon: <span className="text-xs font-bold">H{level}</span> },
  ])
)

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

  // 构建导航序列并根据搜索过滤
  const { navItems, headingVisible } = useMemo(() => {
    const allNav = buildNavItems()
    const hasQuery = searchQuery.trim().length > 0

    if (!hasQuery) {
      return {
        navItems: allNav,
        headingVisible: new Set([1, 2, 3, 4, 5, 6]),
      }
    }

    const q = searchQuery.toLowerCase()
    const headingVisible = new Set<number>()
    const navItems: NavItem[] = []

    for (const nav of allNav) {
      if (nav.type === 'heading') {
        const cmd = headingMap.get(nav.headingLevel!)!
        if (cmd.title.toLowerCase().includes(q)) {
          headingVisible.add(nav.headingLevel!)
          navItems.push(nav)
        }
      } else {
        const cmd = commandMap.get(nav.id)!
        if (cmd.title.toLowerCase().includes(q)) {
          navItems.push(nav)
        }
      }
    }

    return { navItems, headingVisible }
  }, [searchQuery])

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

  const navigate = useCallback((direction: 'up' | 'down') => {
    if (navItems.length === 0) return
    setSelectedIndex(prev => {
      const len = navItems.length
      if (direction === 'down') return (prev + 1) % len
      return (prev - 1 + len) % len
    })
  }, [navItems.length])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          navigate(e.shiftKey ? 'up' : 'down')
          break
        case 'ArrowUp':
          e.preventDefault()
          navigate('up')
          break
        case 'ArrowDown':
          e.preventDefault()
          navigate('down')
          break
        case 'Enter':
          e.preventDefault()
          if (navItems[selectedIndex]) {
            onSelect(navItems[selectedIndex].id)
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
  }, [navItems, selectedIndex, navigate, onSelect, onClose])

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

  // 获取命令的显示信息
  const getCommandInfo = (nav: NavItem): CommandItem => {
    if (nav.type === 'heading') {
      return headingMap.get(nav.headingLevel!)!
    }
    return commandMap.get(nav.id)!
  }

  // 获取 navItem 在 navItems 中的索引
  const getNavIndex = (id: string, headingLevel?: number): number => {
    return navItems.findIndex(n => {
      if (n.type === 'heading') return n.headingLevel === headingLevel
      return n.id === id
    })
  }

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
        {navItems.length > 0 ? (
          <>
            {/* 标题行 - H1-H6 合并为一行 */}
            {headingVisible.size > 0 && (
              <div className="heading-row">
                {[1, 2, 3, 4, 5, 6]
                  .filter(level => headingVisible.has(level))
                  .map(level => {
                    const idx = getNavIndex('', level)
                    const isSelected = idx === selectedIndex
                    return (
                      <button
                        key={level}
                        className={`heading-btn ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(`h${level}`)
                        }}
                      >
                        H{level}
                      </button>
                    )
                  })}
              </div>
            )}

            {/* 其他命令 */}
            {navItems
              .filter(nav => nav.type === 'command')
              .map((nav) => {
                const cmd = getCommandInfo(nav)
                const idx = getNavIndex(nav.id)
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={nav.id}
                    onClick={() => onSelect(nav.id)}
                    className={`command-menu-item-compact ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="icon">{cmd.icon}</div>
                    <span className="title">{cmd.title}</span>
                    {cmd.shortcut && (
                      <kbd className="command-shortcut">{cmd.shortcut}</kbd>
                    )}
                  </div>
                )
              })}
          </>
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
