import type { HotkeyConfig } from '@shared/types'

type KeyboardLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function formatKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

function formatModifier(modifier: string): string {
  if (modifier === 'ctrl') return isMacPlatform() ? 'Cmd' : 'Ctrl'
  if (modifier === 'alt') return isMacPlatform() ? 'Option' : 'Alt'
  if (modifier === 'shift') return 'Shift'
  return modifier
}

export function formatHotkeyDisplay(hotkey: Pick<HotkeyConfig, 'key' | 'modifiers'>): string {
  return [...hotkey.modifiers.map(formatModifier), formatKey(hotkey.key)].join('+')
}

export function getModifiersFromEvent(event: KeyboardLike): string[] {
  const modifiers: string[] = []
  if (isMacPlatform() ? event.metaKey : event.ctrlKey) modifiers.push('ctrl')
  if (event.altKey) modifiers.push('alt')
  if (event.shiftKey) modifiers.push('shift')
  return modifiers
}

export function eventMatchesHotkey(event: KeyboardLike, hotkey: Pick<HotkeyConfig, 'key' | 'modifiers'>): boolean {
  if (hotkey.key.toLowerCase() !== event.key.toLowerCase()) return false

  const wantsPrimary = hotkey.modifiers.includes('ctrl')
  const wantsAlt = hotkey.modifiers.includes('alt')
  const wantsShift = hotkey.modifiers.includes('shift')
  const primaryPressed = isMacPlatform() ? event.metaKey : event.ctrlKey

  if (wantsPrimary !== primaryPressed) return false
  if (wantsAlt !== event.altKey) return false
  if (wantsShift !== event.shiftKey) return false
  if (isMacPlatform() && event.ctrlKey) return false
  if (!isMacPlatform() && event.metaKey) return false

  return true
}

export function hasSameHotkey(a: Pick<HotkeyConfig, 'key' | 'modifiers'>, b: Pick<HotkeyConfig, 'key' | 'modifiers'>): boolean {
  if (a.key.toLowerCase() !== b.key.toLowerCase()) return false
  const left = [...a.modifiers].sort().join('+')
  const right = [...b.modifiers].sort().join('+')
  return left === right
}
