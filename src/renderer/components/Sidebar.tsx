import { useRef, useState } from 'react'
import { Check, ChevronDown, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react'
import DocumentTree from './DocumentTree'
import { useAppStore } from '../stores/appStore'
import { Button } from './ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface VaultTarget {
  id: string
  name: string
}

function Sidebar() {
  const {
    vaults, currentVault, createVault, renameVault, deleteVault, switchVault, setSettingsOpen,
  } = useAppStore()
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [renameTarget, setRenameTarget] = useState<VaultTarget | null>(null)
  const [vaultNameDraft, setVaultNameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<VaultTarget | null>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const openAfterVaultMenuCloses = (action: () => void) => {
    setVaultMenuOpen(false)
    queueMicrotask(action)
  }

  const handleCreateVault = async () => {
    const name = newVaultName.trim()
    if (!name) return
    await createVault(name)
    setNewVaultName('')
    setCreateOpen(false)
  }

  const openRename = (target: VaultTarget) => {
    setVaultNameDraft(target.name)
    setRenameTarget(target)
  }

  const handleRenameVault = async () => {
    if (!renameTarget) return
    const name = vaultNameDraft.trim()
    if (!name) return
    if (name === renameTarget.name || await renameVault(renameTarget.id, name)) setRenameTarget(null)
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-3">
        <DropdownMenu modal={false} open={vaultMenuOpen} onOpenChange={setVaultMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label="选择知识库"
              className="w-full justify-between border-sidebar-border bg-background px-3 font-normal"
            >
              <span className="truncate font-medium">{currentVault?.name || '选择知识库'}</span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56"
          >
            <DropdownMenuLabel>知识库</DropdownMenuLabel>
            {vaults.map((vault) => (
              <div key={vault.id} className="flex items-center gap-0.5">
                <DropdownMenuItem
                  title={vault.name}
                  className="min-w-0 flex-1"
                  onSelect={() => void switchVault(vault)}
                >
                  <span className="mr-2 flex h-4 w-4 items-center justify-center">
                    {currentVault?.id === vault.id && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{vault.name}</span>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    aria-label={`管理知识库 ${vault.name}`}
                    className="h-8 w-8 justify-center px-0 [&>svg:last-child]:hidden"
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => openAfterVaultMenuCloses(() => openRename(vault))}>
                    <Pencil className="mr-2 h-4 w-4" />重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => openAfterVaultMenuCloses(() => setDeleteTarget(vault))}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />删除
                  </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </div>
            ))}
            {vaults.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">尚未创建知识库</div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openAfterVaultMenuCloses(() => setCreateOpen(true))}>
              <Plus className="mr-2 h-4 w-4" />新建知识库
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {currentVault ? (
        <DocumentTree />
      ) : (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          请先创建或选择知识库
        </div>
      )}

      <div className="border-t border-sidebar-border p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              设置
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">打开设置</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open)
        if (!open) setNewVaultName('')
      }}>
        <DialogContent
          className="sm:max-w-sm"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            createInputRef.current?.focus()
          }}
        >
          <form onSubmit={(event) => { event.preventDefault(); void handleCreateVault() }}>
            <DialogHeader>
              <DialogTitle>新建知识库</DialogTitle>
              <DialogDescription>知识库用于独立组织文档、画布和附件。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-5">
              <Label htmlFor="new-vault-name">知识库名称</Label>
              <Input
                ref={createInputRef}
                id="new-vault-name"
                value={newVaultName}
                onChange={(event) => setNewVaultName(event.target.value)}
                placeholder="例如：工作笔记"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="submit" disabled={!newVaultName.trim()}>创建</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => { if (!open) setRenameTarget(null) }}>
        <DialogContent
          className="sm:max-w-sm"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            renameInputRef.current?.focus()
            renameInputRef.current?.select()
          }}
        >
          <form onSubmit={(event) => { event.preventDefault(); void handleRenameVault() }}>
            <DialogHeader>
              <DialogTitle>重命名知识库</DialogTitle>
              <DialogDescription>修改后不会影响知识库中的内容。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-5">
              <Label htmlFor="rename-vault-name">知识库名称</Label>
              <Input
                ref={renameInputRef}
                id="rename-vault-name"
                value={vaultNameDraft}
                onChange={(event) => setVaultNameDraft(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>取消</Button>
              <Button type="submit" disabled={!vaultNameDraft.trim()}>保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>知识库及其中的文档、画布和附件将被永久删除，此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) void deleteVault(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}

export default Sidebar
