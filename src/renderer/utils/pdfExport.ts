import type { TocNode } from './headingParser'

/**
 * 为 HTML 内容中的标题添加序号
 *
 * @param html - 原始 HTML 内容
 * @param toc - 包含序号信息的 TOC 树
 * @returns 添加了序号的 HTML 内容
 */
export function addNumbersToHTML(html: string, toc: TocNode[]): string {
  // 创建一个临时 DOM 来解析 HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 将 TOC 树扁平化为数组，方便查找
  const flatToc = flattenToc(toc)

  // 获取所有标题元素
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

  // 为每个标题添加序号
  let tocIndex = 0
  headings.forEach((heading) => {
    const level = parseInt(heading.tagName.substring(1)) // h1 -> 1, h2 -> 2
    const text = heading.textContent?.trim() || ''

    // 在 TOC 中查找匹配的节点
    const tocNode = flatToc[tocIndex]

    if (tocNode && tocNode.level === level && tocNode.text === text && tocNode.number) {
      // 创建序号 span
      const numberSpan = doc.createElement('span')
      numberSpan.style.color = '#64748B' // var(--text-secondary)
      numberSpan.style.marginRight = '0.5em'
      numberSpan.textContent = tocNode.number + ' '

      // 将序号插入到标题开头
      heading.insertBefore(numberSpan, heading.firstChild)

      tocIndex++
    }
  })

  // 返回处理后的 HTML
  return doc.body.innerHTML
}

/**
 * 将 TOC 树扁平化为数组
 */
function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = []

  function walk(node: TocNode) {
    result.push(node)
    node.children.forEach(walk)
  }

  nodes.forEach(walk)
  return result
}
