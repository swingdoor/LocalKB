export type NodeBorderStyle = 'solid' | 'dashed' | 'dotted'
export type NodeBackgroundPattern = 'solid' | 'diagonal' | 'lines'

export const DEFAULT_NODE_BORDER_COLOR = '#e4e4e7'
export const DEFAULT_NODE_BACKGROUND_COLOR = '#ffffff'

const HEX_COLOR = /#[0-9a-f]{6}/i

export function nodeBorderStyle(border?: string): NodeBorderStyle {
  if (border?.includes('dashed')) return 'dashed'
  if (border?.includes('dotted')) return 'dotted'
  return 'solid'
}

export function nodeBorderColor(border?: string): string | undefined {
  return border?.match(HEX_COLOR)?.[0]?.toLowerCase()
}

export function createNodeBorder(color: string | undefined, style: NodeBorderStyle): string | undefined {
  if (!color && style === 'solid') return undefined
  return `1px ${style} ${color ?? DEFAULT_NODE_BORDER_COLOR}`
}

export function nodeBackgroundPattern(background?: string): NodeBackgroundPattern {
  if (background?.startsWith('repeating-linear-gradient(0deg')) return 'lines'
  if (background?.startsWith('repeating-linear-gradient')) return 'diagonal'
  // The retired dot pattern is not presented as the new line pattern. Returning
  // solid leaves every current choice clickable instead of falsely selecting it.
  if (background?.startsWith('radial-gradient')) return 'solid'
  return 'solid'
}

export function nodeBackgroundColor(background?: string): string | undefined {
  if (!background) return undefined
  return background.match(HEX_COLOR)?.[0]?.toLowerCase()
}

export function createNodeBackground(color: string | undefined, pattern: NodeBackgroundPattern): string | undefined {
  if (pattern === 'solid') return color
  const base = color ?? DEFAULT_NODE_BACKGROUND_COLOR
  if (pattern === 'diagonal') {
    return `repeating-linear-gradient(135deg, ${base} 0, ${base} 8px, rgba(24,24,27,0.08) 8px, rgba(24,24,27,0.08) 10px), ${base}`
  }
  return `repeating-linear-gradient(0deg, ${base} 0, ${base} 7px, rgba(24,24,27,0.14) 7px, rgba(24,24,27,0.14) 8px), ${base}`
}
