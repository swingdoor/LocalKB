import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'

export const MenuSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function MenuSurface({ className = '', ...props }, ref) {
    return <div ref={ref} role="toolbar" className={`bubble-menu editor-menu-surface ${className}`} {...props} />
  },
)

interface MenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  destructive?: boolean
  children: ReactNode
}

export function MenuButton({
  label,
  active = false,
  destructive = false,
  className = '',
  children,
  onPointerDown,
  ...props
}: MenuButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${active ? 'is-active' : ''} ${destructive ? 'is-destructive' : ''} ${className}`.trim()}
      onPointerDown={(event) => {
        // Menu commands operate on the editor selection, not button focus.
        event.preventDefault()
        onPointerDown?.(event)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export function MenuDivider() {
  return <div role="separator" className="divider" />
}

export type MenuAlignment = 'left' | 'center' | 'right'

export function AlignmentButtons({
  value,
  onChange,
}: {
  value: MenuAlignment
  onChange: (alignment: MenuAlignment) => void
}) {
  return (
    <>
      <MenuButton label="左对齐" active={value === 'left'} onClick={() => onChange('left')}><AlignLeft className="h-4 w-4" /></MenuButton>
      <MenuButton label="居中" active={value === 'center'} onClick={() => onChange('center')}><AlignCenter className="h-4 w-4" /></MenuButton>
      <MenuButton label="右对齐" active={value === 'right'} onClick={() => onChange('right')}><AlignRight className="h-4 w-4" /></MenuButton>
    </>
  )
}
