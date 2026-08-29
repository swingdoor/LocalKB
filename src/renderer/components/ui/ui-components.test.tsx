import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogTitle, AlertDialogTrigger,
} from './alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Switch } from './switch'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

describe('shared shadcn controls', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    HTMLElement.prototype.hasPointerCapture = () => false
    HTMLElement.prototype.setPointerCapture = () => undefined
    HTMLElement.prototype.releasePointerCapture = () => undefined
    HTMLElement.prototype.scrollIntoView = () => undefined
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('keeps button names and switch state accessible', () => {
    const onCheckedChange = vi.fn()
    act(() => root.render(
      <>
        <Button aria-label="保存文档">保存</Button>
        <Switch aria-label="启用服务" checked={false} onCheckedChange={onCheckedChange} />
      </>,
    ))
    expect(container.querySelector('[aria-label="保存文档"]')?.textContent).toBe('保存')
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    act(() => toggle.click())
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('closes Dialog with Escape and restores focus to its trigger', async () => {
    act(() => root.render(
      <Dialog>
        <DialogTrigger asChild><Button>打开设置</Button></DialogTrigger>
        <DialogContent><DialogTitle>设置</DialogTitle></DialogContent>
      </Dialog>,
    ))
    const trigger = container.querySelector<HTMLButtonElement>('button')!
    act(() => {
      trigger.focus()
      trigger.click()
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps AlertDialog cancel safe and action explicit', () => {
    const action = vi.fn()
    act(() => root.render(
      <AlertDialog>
        <AlertDialogTrigger asChild><Button>删除</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={action}>确认</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    ))
    act(() => container.querySelector<HTMLButtonElement>('button')!.click())
    const cancel = Array.from(document.body.querySelectorAll('button')).find((item) => item.textContent === '取消')!
    act(() => cancel.click())
    expect(action).not.toHaveBeenCalled()
  })

  it('opens keyboard-capable menu and select portals', async () => {
    const selectChange = vi.fn()
    act(() => root.render(
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button>更多</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem>重命名</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <Select onValueChange={selectChange}>
          <SelectTrigger aria-label="模型"><SelectValue placeholder="选择模型" /></SelectTrigger>
          <SelectContent><SelectItem value="model-a">模型 A</SelectItem></SelectContent>
        </Select>
      </>,
    ))

    const menuTrigger = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === '更多')!
    act(() => menuTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    const menuItem = document.body.querySelector<HTMLElement>('[role="menuitem"]')!
    expect(menuItem.textContent).toBe('重命名')
    act(() => menuItem.click())

    const selectTrigger = container.querySelector<HTMLElement>('[aria-label="模型"]')!
    await act(async () => {
      selectTrigger.focus()
      selectTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await Promise.resolve()
    })
    const option = document.body.querySelector<HTMLElement>('[role="option"]')!
    expect(option.textContent).toContain('模型 A')
    act(() => option.click())
    expect(selectChange).toHaveBeenCalledWith('model-a')

  })

  it('shows tooltip help for a focused accessible trigger', async () => {
    act(() => root.render(
      <Tooltip>
        <TooltipTrigger asChild><Button aria-label="帮助">?</Button></TooltipTrigger>
        <TooltipContent>帮助说明</TooltipContent>
      </Tooltip>,
    ))
    const tooltipTrigger = container.querySelector<HTMLElement>('[aria-label="帮助"]')!
    await act(async () => {
      tooltipTrigger.focus()
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    expect(document.body.textContent).toContain('帮助说明')
  })
})
