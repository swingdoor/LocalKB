import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { sidebarOpen, toggleSidebar } = useAppStore()

  useEffect(() => {
    // 检查初始状态
    window.electronAPI.window.isMaximized().then(setIsMaximized)
    
    // 监听状态变化
    const unsubscribe = window.electronAPI.window.onMaximizedChange(setIsMaximized)
    return unsubscribe
  }, [])

  const handleMinimize = () => {
    window.electronAPI.window.minimize()
  }

  const handleMaximize = () => {
    window.electronAPI.window.maximize()
  }

  const handleClose = () => {
    window.electronAPI.window.close()
  }

  return (
    <div className="flex items-center h-9 border-b select-none" style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}>
      {/* 拖拽区域 */}
      <div className="flex-1 h-full flex items-center px-4" style={{ WebkitAppRegion: 'drag' } as any}>
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
      
      {/* 窗口控制按钮 */}
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-primary)' }}
          title="最小化"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        
        {/* 最大化/还原 */}
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-primary)' }}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4h8a2 2 0 012 2v8a2 2 0 01-2 2h-2m-4 4H6a2 2 0 01-2-2v-8a2 2 0 012-2h2" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
            </svg>
          )}
        </button>
        
        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-primary)' }}
          title="关闭"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
