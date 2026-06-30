import { useAppStore } from '../stores/appStore'

// 检测是否为 macOS
const isMac = window.electronAPI?.app?.getPlatform?.() === 'darwin' ||
              navigator.platform.toLowerCase().includes('mac')

function TitleBar() {
  const { sidebarOpen, toggleSidebar } = useAppStore()

  return (
    <div
      className="flex items-center h-9 border-b select-none"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-color)',
        height: 'env(titlebar-area-height, 36px)',
      }}
    >
      {/* 拖拽区域 */}
      <div
        className="flex-1 h-full flex items-center"
        style={{
          WebkitAppRegion: 'drag',
          marginLeft: 'env(titlebar-area-x, 0px)',
          width: 'env(titlebar-area-width, 100%)',
          paddingLeft: isMac ? '88px' : '16px',
          paddingRight: '16px',
        } as any}
      >
        <span className="text-sm font-medium mr-3" style={{ color: 'var(--text-primary)' }}>极简笔记</span>
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-gray-200 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-primary)' }}>
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            )}
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
