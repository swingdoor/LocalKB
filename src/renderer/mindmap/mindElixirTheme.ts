import type { Theme } from 'mind-elixir'
import type { ApplicationTheme } from '@shared/types'

const CLASSIC_MIND_MAP_THEME: Theme = {
  name: 'Jijian Classic',
  type: 'light',
  palette: ['#71717a', '#94a3b8', '#78716c', '#6b7280', '#64748b', '#737373', '#7c7c87', '#82909f'],
  cssVar: {
    '--node-gap-x': '18px',
    '--node-gap-y': '20px',
    '--main-gap-x': '64px',
    '--main-gap-y': '24px',
    '--main-color': '#18181b',
    '--main-bgcolor': '#ffffff',
    '--main-bgcolor-transparent': '#fffffff2',
    '--main-border': '1px solid #e4e4e7',
    '--color': '#27272a',
    '--bgcolor': '#ffffff',
    '--selected': '#18181b',
    '--accent-color': '#18181b',
    '--root-color': '#fafafa',
    '--root-bgcolor': '#18181b',
    '--root-border-color': '#18181b',
    '--root-radius': '8px',
    '--main-radius': '6px',
    '--topic-padding': '6px 10px',
    '--panel-color': '#27272a',
    '--panel-bgcolor': '#ffffff',
    '--panel-border-color': '#e4e4e7',
    '--map-padding': '48px',
  },
}

const PAPER_MIND_MAP_THEME: Theme = {
  name: 'Jijian Paper',
  type: 'light',
  palette: ['#766a5e', '#8a7d70', '#6f7d68', '#7c6f64', '#6f7983', '#8a7868', '#756f78', '#7f756b'],
  cssVar: {
    '--node-gap-x': '18px',
    '--node-gap-y': '20px',
    '--main-gap-x': '64px',
    '--main-gap-y': '24px',
    '--main-color': '#3f372f',
    '--main-bgcolor': '#fdfaf5',
    '--main-bgcolor-transparent': '#fdfaf5f2',
    '--main-border': '1px solid #d8cdbf',
    '--color': '#40372f',
    '--bgcolor': '#faf7f2',
    '--selected': '#315e86',
    '--accent-color': '#315e86',
    '--root-color': '#fbf8f3',
    '--root-bgcolor': '#3f372f',
    '--root-border-color': '#3f372f',
    '--root-radius': '8px',
    '--main-radius': '6px',
    '--topic-padding': '6px 10px',
    '--panel-color': '#40372f',
    '--panel-bgcolor': '#fdfaf5',
    '--panel-border-color': '#d8cdbf',
    '--map-padding': '48px',
  },
}

const NIGHT_MIND_MAP_THEME: Theme = {
  name: 'Jijian Night',
  type: 'dark',
  palette: ['#a1a1aa', '#94a3b8', '#a8a29e', '#9ca3af', '#8ea6bc', '#a3a3a3', '#a1a1aa', '#91a4b5'],
  cssVar: {
    '--node-gap-x': '18px',
    '--node-gap-y': '20px',
    '--main-gap-x': '64px',
    '--main-gap-y': '24px',
    '--main-color': '#e4e4e7',
    '--main-bgcolor': '#27272a',
    '--main-bgcolor-transparent': '#27272af2',
    '--main-border': '1px solid #3f3f46',
    '--color': '#e4e4e7',
    '--bgcolor': '#18181b',
    '--selected': '#79c0ff',
    '--accent-color': '#79c0ff',
    '--root-color': '#18181b',
    '--root-bgcolor': '#f4f4f5',
    '--root-border-color': '#f4f4f5',
    '--root-radius': '8px',
    '--main-radius': '6px',
    '--topic-padding': '6px 10px',
    '--panel-color': '#e4e4e7',
    '--panel-bgcolor': '#27272a',
    '--panel-border-color': '#3f3f46',
    '--map-padding': '48px',
  },
}

export const JIJIAN_MIND_MAP_SCREEN_THEMES: Record<ApplicationTheme, Theme> = {
  classic: CLASSIC_MIND_MAP_THEME,
  paper: PAPER_MIND_MAP_THEME,
  night: NIGHT_MIND_MAP_THEME,
}

export function getMindMapScreenTheme(theme: ApplicationTheme): Theme {
  return JIJIAN_MIND_MAP_SCREEN_THEMES[theme]
}

/** Fixed light export theme. It intentionally does not follow the application. */
export const JIJIAN_MIND_MAP_EXPORT_THEME = CLASSIC_MIND_MAP_THEME

/** Compatibility alias for tests and callers that still mean the fixed export theme. */
export const JIJIAN_MIND_MAP_THEME = JIJIAN_MIND_MAP_EXPORT_THEME

export const MIND_MAP_EXPORT_CSS = `
  .map-container,.mind-elixir{background:#fff;color:#27272a;font-family:var(--editor-font-family,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif)}
  me-tpc{font-family:inherit;letter-spacing:.01em}
  me-parent>me-tpc{border:1px solid #e4e4e7;border-radius:6px;background:#fff;box-shadow:0 1px 2px rgb(0 0 0/.04)}
  me-root>me-tpc{border-color:#18181b;border-radius:8px;background:#18181b;color:#fafafa;font-size:24px;font-weight:700;box-shadow:0 1px 3px rgb(0 0 0/.12)}
  me-main>me-wrapper>me-parent>me-tpc{font-size:16px;font-weight:600}
  me-main me-children me-tpc{font-size:14px;font-weight:500}
  me-main me-children me-children me-tpc{font-size:13px;font-weight:400}
  me-tpc>.tags{position:absolute;top:calc(100% + 4px);left:0;display:flex;gap:4px;white-space:nowrap}
  me-parent:has(>me-tpc>.tags){padding-bottom:32px}
  me-root:has(>me-tpc>.tags){padding-bottom:26px}
  .rhs me-tpc>.tags{right:0;left:auto}
  me-nodes.down me-tpc>.tags{left:50%;transform:translateX(-50%)}
  me-tpc>.tags span{margin:0;padding:1px 5px;border:1px solid #e4e4e7;border-radius:999px;background:#fafafa;color:#52525b;font-size:10px;line-height:16px}
`
