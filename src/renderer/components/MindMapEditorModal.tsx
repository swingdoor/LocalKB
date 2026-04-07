import { useEffect, useRef, useState, useCallback } from 'react'
import MindElixir, { DARK_THEME, THEME } from 'mind-elixir'
import 'mind-elixir/style.css'

// Chinese locale for context menu
const CN_LOCALE = {
  addChild: "插入子节点",
  addParent: "插入父节点",
  addSibling: "插入同级节点",
  removeNode: "删除节点",
  focus: "专注",
  cancelFocus: "取消专注",
  moveUp: "上移",
  moveDown: "下移",
  link: "连接",
  linkBidirectional: "双向连接",
  clickTips: "请点击目标节点",
  summary: "摘要"
}

// Theme with proper structure
const createTheme = (name: string, type: 'light' | 'dark', palette: string[], cssVar: Record<string, string>) => ({
  name,
  type,
  palette,
  cssVar: {
    '--node-gap-x': '12px',
    '--node-gap-y': '8px',
    '--main-gap-x': '60px',
    '--main-gap-y': '20px',
    '--main-color': cssVar['--main-color'] || palette[0],
    '--main-bgcolor': cssVar['--main-bgcolor'] || palette[1],
    '--main-bgcolor-transparent': cssVar['--main-bgcolor-transparent'] || palette[1] + '80',
    '--color': cssVar['--color'] || '#333',
    '--bgcolor': cssVar['--bgcolor'] || '#fff',
    '--selected': cssVar['--selected'] || palette[0],
    '--accent-color': cssVar['--accent-color'] || palette[0],
    '--root-color': cssVar['--root-color'] || palette[0],
    '--root-bgcolor': cssVar['--root-bgcolor'] || palette[1],
    '--root-border-color': cssVar['--root-border-color'] || palette[0],
    '--root-radius': cssVar['--root-radius'] || '4px',
    '--main-radius': cssVar['--main-radius'] || '4px',
    '--topic-padding': cssVar['--topic-padding'] || '4px 12px',
    '--panel-color': cssVar['--panel-color'] || '#333',
    '--panel-bgcolor': cssVar['--panel-bgcolor'] || '#fff',
    '--panel-border-color': cssVar['--panel-border-color'] || '#e0e0e0',
    '--map-padding': cssVar['--map-padding'] || '40px',
  }
})

// Pre-defined themes
const THEMES: Record<string, ReturnType<typeof createTheme>> = {
  light: createTheme('浅色', 'light', THEME.palette, {
    '--bgcolor': '#ffffff',
    '--main-color': THEME.cssVar['--main-color'],
    '--main-bgcolor': THEME.cssVar['--main-bgcolor'],
    '--color': THEME.cssVar['--color'],
    '--panel-color': THEME.cssVar['--panel-color'],
    '--panel-bgcolor': THEME.cssVar['--panel-bgcolor'],
    '--panel-border-color': THEME.cssVar['--panel-border-color'],
    '--selected': THEME.cssVar['--selected'],
    '--accent-color': THEME.cssVar['--accent-color'],
    '--root-color': THEME.cssVar['--root-color'],
    '--root-bgcolor': THEME.cssVar['--root-bgcolor'],
    '--root-border-color': THEME.cssVar['--root-border-color'],
  }),
  dark: createTheme('深色', 'dark', DARK_THEME.palette, {
    '--bgcolor': '#1e1e1e',
    '--main-color': DARK_THEME.cssVar['--main-color'],
    '--main-bgcolor': DARK_THEME.cssVar['--main-bgcolor'],
    '--color': DARK_THEME.cssVar['--color'],
    '--panel-color': DARK_THEME.cssVar['--panel-color'],
    '--panel-bgcolor': DARK_THEME.cssVar['--panel-bgcolor'],
    '--panel-border-color': DARK_THEME.cssVar['--panel-border-color'],
    '--selected': DARK_THEME.cssVar['--selected'],
    '--accent-color': DARK_THEME.cssVar['--accent-color'],
    '--root-color': DARK_THEME.cssVar['--root-color'],
    '--root-bgcolor': DARK_THEME.cssVar['--root-bgcolor'],
    '--root-border-color': DARK_THEME.cssVar['--root-border-color'],
  }),
  warm: createTheme('暖黄', 'light', THEME.palette, {
    '--bgcolor': '#fffbeb',
    '--main-color': '#92400e',
    '--main-bgcolor': '#fef3c7',
    '--color': '#78350f',
    '--panel-color': '#78350f',
    '--panel-bgcolor': '#fef3c7',
    '--panel-border-color': '#fde68a',
    '--selected': '#f59e0b',
    '--accent-color': '#f59e0b',
    '--root-color': '#78350f',
    '--root-bgcolor': '#fef3c7',
    '--root-border-color': '#92400e',
  }),
  green: createTheme('浅绿', 'light', 
    ['#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#4ade80', '#86efac', '#bbf7d0'],
    {
      '--bgcolor': '#f0fdf4',
      '--main-color': '#166534',
      '--main-bgcolor': '#dcfce7',
      '--color': '#14532d',
      '--panel-color': '#166534',
      '--panel-bgcolor': '#dcfce7',
      '--panel-border-color': '#86efac',
      '--selected': '#22c55e',
      '--accent-color': '#22c55e',
      '--root-color': '#14532d',
      '--root-bgcolor': '#dcfce7',
      '--root-border-color': '#166534',
    }
  ),
}

interface MindMapEditorModalProps {
  mindmapData: string
  isOpen: boolean
  onSave: (data: string) => void
  onClose: () => void
}

function MindMapEditorModal({ mindmapData, isOpen, onSave, onClose }: MindMapEditorModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mindInstanceRef = useRef<InstanceType<typeof MindElixir> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentTheme, setCurrentTheme] = useState<string>('light')
  const [showThemeMenu, setShowThemeMenu] = useState(false)

  // Get initial theme based on system dark mode
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setCurrentTheme(isDark ? 'dark' : 'light')
  }, [])

  // Initialize mind-elixir when modal opens
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    // Clean up previous instance
    if (mindInstanceRef.current) {
      mindInstanceRef.current = null
      containerRef.current.innerHTML = ''
    }

    const theme = THEMES[currentTheme]
    if (!theme) return

    const mind = new MindElixir({
      el: containerRef.current,
      theme: theme as any,
      toolBar: true,
      keypress: true,
      allowUndo: true,
      contextMenu: {
        locale: CN_LOCALE,
        focus: true,
        link: true,
      },
    } as any)

    try {
      if (mindmapData) {
        // Try to parse as stored format first
        const parsed = JSON.parse(mindmapData)
        if (parsed.data) {
          // New format: { svg, data }
          mind.init(parsed.data as any)
          // 如果数据中有主题信息，使用数据中的主题
          if (parsed.data.theme) {
            const themeName = parsed.data.theme.name
            if (THEMES[themeName]) {
              setCurrentTheme(themeName)
            }
          }
        } else if (parsed.nodeData) {
          // Already mind-elixir format
          mind.init(parsed as any)
        }
      } else {
        mind.init(MindElixir.new('中心主题'))
      }
    } catch {
      mind.init(MindElixir.new('中心主题'))
    }

    mindInstanceRef.current = mind

    return () => {
      mindInstanceRef.current = null
    }
  }, [isOpen, mindmapData])

  // Switch theme
  const switchTheme = useCallback((themeName: string) => {
    if (!mindInstanceRef.current) return
    
    const theme = THEMES[themeName]
    if (theme) {
      (mindInstanceRef.current as any).changeTheme(theme, true)
      setCurrentTheme(themeName)
    }
    setShowThemeMenu(false)
  }, [])

  // Handle save - export SVG preview + save raw data
  const handleSave = useCallback(async () => {
    if (!mindInstanceRef.current) return
    
    try {
      // Get raw data (includes theme)
      const rawData = mindInstanceRef.current.getData()
      
      // Export SVG for preview - small padding for less whitespace
      const svgBlob = mindInstanceRef.current.exportSvg(true, '0')
      const svgString = svgBlob ? await svgBlob.text() : ''
      
      // Create data URL for SVG
      const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
      const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`
      
      // Store both SVG preview and raw data
      const storedData = {
        svg: svgDataUrl,
        data: rawData,
      }
      
      onSave(JSON.stringify(storedData))
    } catch (err) {
      console.error('Failed to export mind map:', err)
      setError('导出思维导图失败')
    }
  }, [onSave])

  // Handle download PNG
  const handleDownloadPng = useCallback(async () => {
    if (!mindInstanceRef.current) return
    
    try {
      const blob = await mindInstanceRef.current.exportPng(true, '0')
      if (!blob) {
        setError('导出图片失败')
        return
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `mindmap-${timestamp}.png`
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download PNG:', err)
      setError('下载图片失败')
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium">编辑思维导图</h3>
            
            {/* Theme Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <span>主题: {THEMES[currentTheme]?.name || '浅色'}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showThemeMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[120px]">
                  {Object.entries(THEMES).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => switchTheme(key)}
                      className={`w-full px-4 py-2 text-sm text-left hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg ${
                        currentTheme === key ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {theme.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {error && <span className="text-sm text-red-500">{error}</span>}
            <button
              onClick={handleDownloadPng}
              className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              下载图片
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
        
        {/* Mind Elixir container */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={containerRef}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      </div>
      
      {/* Click outside to close theme menu */}
      {showThemeMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowThemeMenu(false)}
        />
      )}
    </div>
  )
}

export default MindMapEditorModal
