import { useEffect, useRef, useState } from 'react'
import MindElixir, { DARK_THEME, THEME } from 'mind-elixir'

interface MindElixirCanvasProps {
  data: string
  _onUpdate?: (data: string) => void
}

function MindElixirCanvas({ data }: MindElixirCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mindInstanceRef = useRef<InstanceType<typeof MindElixir> | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Initialize mind-elixir
  useEffect(() => {
    if (!containerRef.current) return

    // Clean up previous instance
    if (mindInstanceRef.current) {
      mindInstanceRef.current = null
      containerRef.current.innerHTML = ''
    }

    // Check if dark mode
    const isDark = document.documentElement.classList.contains('dark')

    const mind = new MindElixir({
      el: containerRef.current,
      theme: isDark ? DARK_THEME : THEME,
    })

    try {
      if (data) {
        const parsedData = JSON.parse(data)
        mind.init(parsedData)
      } else {
        mind.init(MindElixir.new('中心主题'))
      }
    } catch {
      mind.init(MindElixir.new('中心主题'))
    }

    mindInstanceRef.current = mind
    setIsReady(true)

    return () => {
      mindInstanceRef.current = null
    }
  }, [data])

  const LoadingFallback = (
    <div className="flex items-center justify-center bg-gray-50" style={{ minHeight: '150px' }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-gray-500">加载思维导图中...</p>
      </div>
    </div>
  )

  if (!isReady) {
    return LoadingFallback
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: '150px',
      }}
    />
  )
}

export default MindElixirCanvas
