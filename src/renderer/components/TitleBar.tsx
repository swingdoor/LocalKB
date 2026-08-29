import { useAppStore } from '../stores/appStore'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

// 检测是否为 macOS
const isMac = window.electronAPI?.app?.getPlatform?.() === 'darwin' ||
              navigator.platform.toLowerCase().includes('mac')

function TitleBar() {
  const { sidebarOpen, toggleSidebar } = useAppStore()

  return (
    <div
      className="flex h-9 select-none items-center border-b border-border bg-background"
      style={{
        height: 'env(titlebar-area-height, 36px)',
      }}
    >
      {/* 拖拽区域 */}
      <div
        className="flex-1 h-full flex items-center"
        data-app-region="drag"
        style={{
          WebkitAppRegion: 'drag',
          marginLeft: 'env(titlebar-area-x, 0px)',
          width: 'env(titlebar-area-width, 100%)',
          paddingLeft: isMac ? '88px' : '16px',
          paddingRight: '16px',
        } as any}
      >
        <span className="mr-3 text-sm font-medium text-foreground">极简笔记</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
              data-app-region="no-drag"
              onClick={toggleSidebar}
              className="h-7 w-7"
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarOpen ? '收起侧边栏' : '展开侧边栏'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export default TitleBar
