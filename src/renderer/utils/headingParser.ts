/**
 * headingParser.ts
 * 
 * Parses TipTap/ProseMirror JSON document into a hierarchical TOC tree.
 * 
 * TipTap JSON structure:
 * {
 *   type: "doc",
 *   content: [
 *     { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "..." }] },
 *     { type: "paragraph", content: [...] },
 *     ...
 *   ]
 * }
 */

// ============================================================================
// Types
// ============================================================================

/** 单个 TOC 节点 */
export interface TocNode {
  /** 节点唯一 ID（用于 key 和锚点） */
  id: string
  /** 标题文本 */
  text: string
  /** 标题级别 1-6 */
  level: number
  /** 在文档中的字符偏移位置（用于点击定位），undefined 表示未解析 */
  pos?: number
  /** 章节序号（如 "1", "1.1", "1.2.1"） */
  number?: string
  /** 子节点 */
  children: TocNode[]
}

/** 解析选项 */
export interface ParseHeadingsOptions {
  /** 是否计算每个标题的位置（用于点击定位），默认 true */
  includePos?: boolean
}

// ============================================================================
// Utilities
// ============================================================================

/** 从 TipTap 文本节点数组中提取纯文本 */
function extractText(content: Array<{ type: string; text?: string; content?: unknown[] }> | undefined): string {
  if (!content || !Array.isArray(content)) return ''
  return content.map(node => {
    if (node.type === 'text' && node.text) return node.text
    if (node.type === 'hardBreak') return '\n'
    // 递归处理内联元素（如 link, bold 等包裹的文本）
    if (Array.isArray(node.content)) return extractText(node.content as typeof content)
    return ''
  }).join('')
}

/** 生成简洁的 heading ID（用于锚点） */
function generateHeadingId(text: string, index: number, level: number): string {
  // 使用文本的 hash 或前 N 个字符 + 索引确保唯一
  const slug = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')  // 非字母数字字符替换为连字符（保留中日韩字符）
    .replace(/^-|-$/g, '')                   // 去除首尾连字符
    .slice(0, 30)                            // 限制长度
  return slug ? `heading-${slug}` : `heading-${level}-${index}`
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * 将 TipTap JSON 文档解析为扁平的标题列表（带层级关系）
 * 
 * @param doc - TipTap JSON 的 doc 节点
 * @returns 标题列表，每个节点包含 level 和嵌套的 children
 */
export function parseHeadings(doc: { type: string; content?: unknown[] }): TocNode[] {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) {
    return []
  }

  const headings: TocNode[] = []
  let headingIndex = 0

  // 第一遍：收集所有标题节点（扁平）
  for (const node of doc.content as Array<{ type: string; attrs?: { level?: number }; content?: unknown[] }>) {
    if (node.type === 'heading') {
      const level = node.attrs?.level ?? 1
      if (level >= 1 && level <= 6) {
        const text = extractText(node.content as ReturnType<typeof extractText> extends (infer T)[] ? T[] : never)
        headings.push({
          id: generateHeadingId(text, headingIndex, level),
          text,
          level,
          children: [],
        })
        headingIndex++
      }
    }
  }

  // 第二遍：根据层级关系构建树
  // 使用栈来维护当前路径：栈顶是最近的祖先节点
  const root: TocNode[] = []
  const stack: TocNode[] = []

  for (const heading of headings) {
    // 弹出栈中级别 >= 当前标题的节点（它们不是祖先）
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      // 没有祖先，直接添加到根列表
      root.push(heading)
    } else {
      // 当前栈顶是最近的更低级别的祖先
      stack[stack.length - 1].children.push(heading)
    }

    // 当前节点入栈
    stack.push(heading)
  }

  return root
}

/**
 * 解析 TipTap JSON 字符串为标题树
 * 
 * @param jsonString - editor.getJSON() 返回的 JSON 字符串
 * @param options - 解析选项
 */
export function parseHeadingsFromJSON(jsonString: string, options: ParseHeadingsOptions = {}): TocNode[] {
  try {
    const doc = JSON.parse(jsonString)
    return parseHeadings(doc)
  } catch {
    return []
  }
}

/**
 * 计算每个标题在文档中的字符位置
 * 需要在编辑器上下文中调用，使用 ProseMirror 的遍历能力
 * 
 * @param editor - TipTap editor 实例
 * @param toc - parseHeadings 返回的标题树
 * @returns 添加了 pos 属性的标题树
 */
export function computeHeadingPositions(
  editor: { state: { doc: { descendants: (callback: (node: { type: string; attrs?: Record<string, unknown>; content?: unknown[] }, pos: number) => boolean | void) => void } } },
  toc: TocNode[]
): TocNode[] {
  const positionMap = new Map<string, number>()

  editor.state.doc.descendants((node, pos) => {
    if (node.type === 'heading') {
      const level = (node.attrs?.level as number) ?? 1
      const text = extractText(node.content as Parameters<typeof extractText>[0])
      // 尝试匹配：按顺序找到第一个文本匹配的标题
      for (const tocNode of flattenToc(toc)) {
        if (tocNode.text === text && tocNode.level === level && !positionMap.has(tocNode.id)) {
          positionMap.set(tocNode.id, pos)
          return false // 找到后停止遍历这个分支
        }
      }
    }
  })

  return attachPositions(toc, positionMap)
}

/** 将 TOC 树扁平化为数组（用于遍历） */
export function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = []
  function walk(node: TocNode) {
    result.push(node)
    node.children.forEach(walk)
  }
  nodes.forEach(walk)
  return result
}

/** 递归附加位置信息 */
function attachPositions(nodes: TocNode[], posMap: Map<string, number>): TocNode[] {
  return nodes.map(node => ({
    ...node,
    pos: posMap.get(node.id),
    children: attachPositions(node.children, posMap),
  }))
}

// ============================================================================
// Numbering
// ============================================================================

/**
 * 为 TOC 树添加章节序号
 *
 * @param nodes - TOC 树
 * @returns 添加了 number 属性的 TOC 树
 */
export function addHeadingNumbers(nodes: TocNode[]): TocNode[] {
  // 计数器数组，索引对应标题级别（1-6）
  const counters: number[] = [0, 0, 0, 0, 0, 0]

  function processNode(node: TocNode, parentLevel: number): TocNode {
    const level = node.level - 1 // 转换为 0-based 索引

    // 重置更深层级的计数器
    for (let i = level + 1; i < counters.length; i++) {
      counters[i] = 0
    }

    // 当前级别计数器加 1
    counters[level]++

    // 生成序号字符串（只包含有效的层级）
    const numberParts: number[] = []
    for (let i = 0; i <= level; i++) {
      if (counters[i] > 0) {
        numberParts.push(counters[i])
      }
    }
    const number = numberParts.join('.')

    // 递归处理子节点
    const children = node.children.map(child => processNode(child, level))

    return {
      ...node,
      number,
      children,
    }
  }

  return nodes.map(node => processNode(node, -1))
}
