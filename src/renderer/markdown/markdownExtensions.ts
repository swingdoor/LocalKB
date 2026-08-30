import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { Table } from '@tiptap/extension-table'
import { TextStyle } from '@tiptap/extension-text-style'

const officialTableRenderer = Table.config.renderMarkdown

export const MarkdownTable = Table.extend({
  renderMarkdown(node, helpers, context) {
    if (!officialTableRenderer) throw new Error('TipTap Markdown 表格 serializer 尚未初始化')
    return officialTableRenderer(node, helpers, context)
  },
})

export const MarkdownDetailsSummary = DetailsSummary.extend({
  renderMarkdown(node, helpers) {
    return `<summary>${helpers.renderChildren(node.content ?? [], '')}</summary>`
  },
})

export const MarkdownDetailsContent = DetailsContent.extend({
  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], '\n\n')
  },
})

export const MarkdownDetails = Details.extend({
  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node.content ?? [], '\n\n').trim()
    return `<details>\n${content}\n</details>`
  },
})

// Font family, size and color are presentation-only in the app. Markdown has no
// portable equivalent, so deliberately keep the marked text and drop the style.
export const MarkdownTextStyle = TextStyle.extend({
  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], '')
  },
})
