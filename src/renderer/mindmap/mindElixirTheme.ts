import type { Theme } from 'mind-elixir'

/**
 * The only application-owned Mind Elixir theme. Keep concrete colors here so
 * offscreen exports render identically when CSS variables are unavailable.
 */
export const JIJIAN_MIND_MAP_THEME: Theme = {
  name: 'Jijian Light',
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
