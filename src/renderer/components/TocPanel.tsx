import React, { useState, useCallback, useEffect } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { TocNode } from '../utils/headingParser'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

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
        className="group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted"
        style={{ 
          paddingLeft: `${indentPx + 8}px`,
        }}
        onClick={handleClick}
        title={node.text}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            className="h-4 w-4 flex-shrink-0 text-muted-foreground"
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </Button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* 级别指示器 */}
        <span
          className="min-w-[14px] flex-shrink-0 text-xs font-medium text-muted-foreground"
        >
          H{node.level}
        </span>

        {/* 章节序号 */}
        {showNumbers && node.number && (
          <span className="mr-1 flex-shrink-0 text-xs text-muted-foreground">
            {node.number}
          </span>
        )}

        {/* 标题文本 */}
        <span className={`flex-1 truncate ${node.level <= 2 ? 'font-medium' : ''}`}>
          {node.text || <span className="italic text-muted-foreground">无标题</span>}
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
      className="flex h-full flex-col border-l border-border bg-background transition-all duration-200"
      style={{
        width: isVisible ? '260px' : '0px',
        minWidth: isVisible ? '260px' : '0px',
        overflow: isVisible ? 'visible' : 'hidden',
      }}
      role="navigation"
      aria-label="文档目录"
    >
      {/* 面板头部 */}
      <div className="flex flex-shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">目录</span>
        {onToggle && (
          <Tooltip>
            <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle} aria-label="关闭目录面板"><X className="h-4 w-4" /></Button></TooltipTrigger>
            <TooltipContent>关闭目录</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* 目录内容 */}
      <div className="flex-1 overflow-y-auto py-2">
        {isEmpty ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
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
