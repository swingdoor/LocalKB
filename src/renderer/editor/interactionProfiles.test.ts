import { describe, expect, it } from 'vitest'
import { INTERACTION_PROFILES } from './interactionProfiles'
import { NON_ROOT_NODE_TYPES, ROOT_BLOCK_NODE_TYPES, SLASH_COMMAND_CATALOG } from './nodeCatalog'

describe('editor interaction profiles', () => {
  it('defines one complete interaction profile for every root block', () => {
    expect(ROOT_BLOCK_NODE_TYPES.every((nodeType) => (
      INTERACTION_PROFILES[nodeType]?.rootBlock
      && INTERACTION_PROFILES[nodeType]?.blockMenu !== null
    ))).toBe(true)
  })

  it('keeps inline and structural child nodes out of root block controls', () => {
    expect(INTERACTION_PROFILES.documentReference).toMatchObject({
      rootBlock: false,
      blockMenu: null,
      nodeMenu: 'document-reference',
    })
    for (const nodeType of NON_ROOT_NODE_TYPES.filter((type) => type !== 'documentReference')) {
      expect(INTERACTION_PROFILES[nodeType]).toBeUndefined()
    }
  })

  it('maps every slash insertion result to a declared scope without embedding commands', () => {
    for (const command of SLASH_COMMAND_CATALOG) {
      for (const nodeType of command.resultNodeTypes) {
        const profile = INTERACTION_PROFILES[nodeType]
        expect(profile, `${command.id} -> ${nodeType}`).toBeDefined()
        expect(profile.rootBlock).toBe(command.scope === 'root-block')
      }
    }
    expect(JSON.stringify(INTERACTION_PROFILES)).not.toContain('onClick')
    expect(JSON.stringify(INTERACTION_PROFILES)).not.toContain('command')
  })

  it('assigns text menus and local controls only to compatible node domains', () => {
    expect(INTERACTION_PROFILES.codeBlock).toMatchObject({ textMenu: false, localControls: 'code' })
    expect(INTERACTION_PROFILES.table).toMatchObject({ textMenu: true, localControls: 'table' })
    expect(INTERACTION_PROFILES.canvasReference).toMatchObject({ textMenu: false, localControls: 'resource-preview' })
    expect(INTERACTION_PROFILES.mindmapReference).toMatchObject({ textMenu: false, localControls: 'resource-preview' })
    expect(INTERACTION_PROFILES.fileAttachment).toMatchObject({ textMenu: false, localControls: 'attachment-card' })
  })
})
