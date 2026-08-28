import { describe, expect, it } from 'vitest'
import { maskMcpSettings } from './mcp-types'

describe('MCP public settings', () => {
  it('never exposes the connection token to renderer code', () => {
    const token = '0123456789abcdefghijklmnopqrstuvwxyz'
    const visible = maskMcpSettings({ enabled: true, port: 39081, token })

    expect(visible).toEqual({ enabled: true, port: 39081, maskedToken: '0123••••wxyz' })
    expect(JSON.stringify(visible)).not.toContain(token)
    expect(visible).not.toHaveProperty('token')
  })
})
