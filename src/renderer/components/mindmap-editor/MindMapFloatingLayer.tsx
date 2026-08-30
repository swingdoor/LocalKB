import { forwardRef, type ReactNode } from 'react'

export const MindMapFloatingLayer = forwardRef<HTMLDivElement, { children?: ReactNode }>(
  function MindMapFloatingLayer({ children }, ref) {
    return <div
      ref={ref}
      data-mindmap-floating-layer=""
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
    >
      {children}
    </div>
  },
)
