import React, { useState, useCallback, useEffect } from 'react'
import type { TocNode } from '../utils/headingParser'

// ============================================================================
// Types
// ============================================================================

interface TocPanelProps {
  /** 标题树数据 */
  toc: TocNode[]
  /** 点击标题时的回调（传入标题的文档位置 pos） */
  onNavigate: (pos: number | undefined, id: string) => void
  /** 是否显示面板，默认 true */
  isVisible?: boolean
  /** 切换显示状态的回调 */
  onToggle?: () => void
  /** 是否显示章节序号 */
  showNumbers?: boolean
}

// ============================================================================
// Sub-components
// ============================================================================

/** 单个 TOC 节点行 */
function TocNodeRow({
  node,
  depth,
  onToggle,
  expandedNodes,
  onNavigate,
  showNumbers,
}: {
  node: TocNode
  depth: number
  onToggle: (id: string) => void
  expandedNodes: Set<string>
  onNavigate: (pos: number | undefined, id: string) => void
  showNumbers?: boolean
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)

  const handleClick = useCallback(() => {
    onNavigate(node.pos, node.id)
  }, [node.pos, node.id, onNavigate])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggle(node.id)
  }, [node.id, onToggle])

  // 左侧缩进：每个层级 16px
  const indentPx = depth * 16

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1 py-1 px-2 rounded cursor-pointer group transition-colors text-sm"
        style={{ 
          paddingLeft: `${indentPx + 8}px`,
          backgroundColor: 'var(--bg-secondary)',
        }}
        onClick={handleClick}
        title={node.text}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="w-4 h-4 flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            <svg
              className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* 级别指示器 */}
        <span
          className="text-xs font-medium flex-shrink-0"
          style={{
            color: levelColor(node.level),
            minWidth: '14px',
          }}
        >
          H{node.level}
        </span>

        {/* 章节序号 */}
        {showNumbers && node.number && (
          <span className="flex-shrink-0 text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>
            {node.number}
          </span>
        )}

        {/* 标题文本 */}
        <span className="truncate flex-1 group-hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
          {node.text || <span className="italic" style={{ color: 'var(--text-secondary)' }}>无标题</span>}
        </span>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <div role="group">
          {node.children.map(child => (
            <TocNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              expandedNodes={expandedNodes}
              onNavigate={onNavigate}
              showNumbers={showNumbers}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/** 根据标题级别返回颜色 */
function levelColor(level: number): string {
  const colors: Record<number, string> = {
    1: '#ef4444', // red-500
    2: '#f97316', // orange-500
    3: '#eab308', // yellow-500
    4: '#22c55e', // green-500
    5: '#3b82f6', // blue-500
    6: '#8b5cf6', // violet-500
  }
  return colors[level] ?? '#6b7280'
}

// ============================================================================
// Main Component
// ============================================================================

function TocPanel({ toc, onNavigate, isVisible = true, onToggle, showNumbers = false }: TocPanelProps) {
  // 记录每个节点是否展开（默认全部展开）
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // 初始化：所有有子节点的节点默认展开
    const expanded = new Set<string>()
    function collectExpanded(nodes: TocNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          expanded.add(node.id)
          collectExpanded(node.children)
        }
      }
    }
    collectExpanded(toc)
    return expanded
  })

  // 当 TOC 数据变化时，重新初始化展开状态
  useEffect(() => {
    const expanded = new Set<string>()
    function collectExpanded(nodes: TocNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          expanded.add(node.id)
          collectExpanded(node.children)
        }
      }
    }
    collectExpanded(toc)
    setExpandedNodes(expanded)
  }, [toc])

  const handleToggle = useCallback((id: string) => {
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

  const isEmpty = toc.length === 0

  return (
    <div
      className="flex flex-col h-full border-l transition-all duration-200"
      style={{
        width: isVisible ? '260px' : '0px',
        minWidth: isVisible ? '260px' : '0px',
        overflow: isVisible ? 'visible' : 'hidden',
        backgroundColor: 'var(--bg-editor)',
        borderColor: 'var(--border-color)',
      }}
      role="navigation"
      aria-label="文档目录"
    >
      {/* 面板头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>目录</span>
        {onToggle && (
          <button
            onClick={onToggle}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
            aria-label="关闭目录面板"
            title="关闭目录"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 目录内容 */}
      <div className="flex-1 overflow-y-auto py-2">
        {isEmpty ? (
          <div className="text-center text-gray-400 text-sm py-8 px-4">
            暂无标题
          </div>
        ) : (
          <div role="tree" className="px-1">
            {toc.map(node => (
              <TocNodeRow
                key={node.id}
                node={node}
                depth={0}
                onToggle={handleToggle}
                expandedNodes={expandedNodes}
                onNavigate={onNavigate}
                showNumbers={showNumbers}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default React.memo(TocPanel)
