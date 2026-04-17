import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { parseHeadings, computeHeadingPositions, flattenToc, addHeadingNumbers, type TocNode } from '../utils/headingParser'

// ============================================================================
// Types
// ============================================================================

interface UseTocOptions {
  /** 防抖延迟（毫秒），默认 300 */
  debounceMs?: number
  /** 是否在_mount 时自动计算位置 */
  computePositionOnMount?: boolean
}

interface UseTocReturn {
  /** 解析后的 TOC 树 */
  toc: TocNode[]
  /** TOC 面板是否可见 */
  isPanelVisible: boolean
  /** 切换面板可见性 */
  togglePanel: () => void
  /** 展开/折叠指定节点 */
  toggleNode: (id: string) => void
  /** 点击标题时调用（用于导航） */
  handleNavigate: (pos: number | undefined, id: string) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * 管理 TOC 状态的 Hook
 * 
 * - 解析 TipTap JSON 为 TOC 树
 * - 防抖更新
 * - 计算标题位置（用于点击导航）
 * - 管理面板显示/隐藏状态
 */
export function useToc(
  editor: Editor | null,
  options: UseTocOptions = {}
): UseTocReturn {
  const {
    debounceMs = 300,
    computePositionOnMount = true,
  } = options

  // TOC 数据
  const [toc, setToc] = useState<TocNode[]>([])
  // 面板可见性
  const [isPanelVisible, setIsPanelVisible] = useState(true)

  // 稳定引用
  const editorRef = useRef(editor)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 保持 editor 引用最新
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // 从 localStorage 恢复面板状态
  useEffect(() => {
    try {
      const stored = localStorage.getItem('toc-panel-visible')
      if (stored !== null) {
        setIsPanelVisible(JSON.parse(stored))
      }
    } catch {
      // ignore
    }
  }, [])

  // 保存面板状态到 localStorage
  const togglePanel = useCallback(() => {
    setIsPanelVisible(prev => {
      const next = !prev
      try {
        localStorage.setItem('toc-panel-visible', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  // 解析并计算 TOC
  const updateToc = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return

    // 从 JSON 解析标题
    const json = ed.getJSON()
    let parsed = parseHeadings(json as { type: string; content?: unknown[] })

    // 添加章节序号
    parsed = addHeadingNumbers(parsed)

    // 计算位置（如果需要点击导航）
    if (computePositionOnMount) {
      // @ts-expect-error - ProseMirror internal API
      const withPositions = computeHeadingPositions(ed, parsed)
      setToc(withPositions)
    } else {
      setToc(parsed)
    }
  }, [computePositionOnMount])

  // 防抖更新
  const scheduleUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(updateToc, debounceMs)
  }, [updateToc, debounceMs])

  // 监听编辑器内容变化
  useEffect(() => {
    if (!editor) return

    // 初始化时解析一次
    updateToc()

    // 监听 onUpdate 事件
    const handler = () => {
      scheduleUpdate()
    }

    editor.on('update', handler)
    return () => {
      editor.off('update', handler)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [editor, updateToc, scheduleUpdate])

  // 展开/折叠节点（本地状态，不持久化）
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // 点击导航：定位到标题位置
  const handleNavigate = useCallback((pos: number | undefined, id: string) => {
    const ed = editorRef.current
    if (!ed) return

    // 查找编辑器内的所有 heading 元素
    const editorDOM = ed.view.dom as HTMLElement
    const headings = editorDOM.querySelectorAll('h1, h2, h3, h4, h5, h6')
    
    // 尝试通过 ID 匹配 heading
    let targetHeading: HTMLElement | null = null
    
    // 方法1: 通过 id 匹配
    targetHeading = Array.from(headings).find(h => h.id === id) as HTMLElement | null
    
    // 方法2: 通过 data-toc-id 匹配 (如果我们给 heading 添加了这个属性)
    if (!targetHeading) {
      targetHeading = Array.from(headings).find(h => h.getAttribute('data-toc-id') === id) as HTMLElement | null
    }
    
    // 方法3: 通过文本内容匹配
    if (!targetHeading) {
      const tocNode = flattenToc(toc).find(n => n.id === id)
      if (tocNode) {
        targetHeading = Array.from(headings).find(h => h.textContent?.trim() === tocNode.text) as HTMLElement | null
      }
    }
    
    if (targetHeading) {
      targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (pos !== undefined && pos > 0) {
      // 回退到使用位置
      ed.commands.setTextSelection({ from: pos, to: pos })
      ed.commands.scrollIntoView()
    }
    
    // 将焦点移到编辑器
    const editorElement = ed.view.dom.closest('[contenteditable]') as HTMLElement
    if (editorElement) {
      editorElement.focus()
    }
  }, [toc])

  return {
    toc,
    isPanelVisible,
    togglePanel,
    toggleNode,
    handleNavigate,
  }
}
