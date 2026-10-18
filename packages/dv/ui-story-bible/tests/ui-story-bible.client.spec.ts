// @vitest-environment jsdom
/** The story bible's canvas node kind, version kinds and references in use, and their registration and removal. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createRegistry } from '@dv/ui-kit/registries.ts'
import type { ChainAnchor, DvCanvas, NodeKind, TakesInUse, VersionKind } from '@dv/ui-kit/registries.ts'
import type { WireState } from '@dv/ui-kit/types.ts'
import { fixtureState, record } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, bibleNodeKind, bibleReferencesInUse, bibleVersionKinds } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => { document.documentElement.lang = '' })

/** @returns empty canvas registries keyed as `DvCanvas` documents. */
function canvasRegistries(): DvCanvas {
  return {
    nodeKinds: createRegistry<NodeKind>(kind => [kind.id]),
    chainAnchors: createRegistry<ChainAnchor>(anchor => [anchor.starter]),
    takesInUse: createRegistry<TakesInUse>(uses => [uses.id]),
    versionKinds: createRegistry<VersionKind>(kind => [kind.kind]),
  }
}

/**
 * The shared fixture plus a second version of the character `hero` (written by `e2` with the take still
 * `shot1-last.png`), a location `alley` without a name, a style `noir`, and a character `ghost` without versions.
 * @returns the state.
 */
function bibleState(): WireState {
  const state = fixtureState()
  state.components.proj.records = [...state.components.proj.records, record({ id: 'e2', operation: 'bible.character_update' })]
  const bible = state.components.bible
  bible.characters['hero']?.push({ id: 'hero', version: 2, name: 'Hero', description: '', references: ['shot1-last.png', 'ref.png'], created_by: 'e2' })
  bible.characters['ghost'] = []
  bible.locations['alley'] = [{ id: 'alley', version: 1, name: '', description: '', references: ['alley.png'], created_by: 'e3' }]
  bible.styles['noir'] = [{ id: 'noir', version: 1, name: 'Noir', description: '', references: [], created_by: 'e4' }]
  return state
}

describe('bibleNodeKind', () => {
  it('draws one seed per character, location and style at its newest version, labeled with its kind in the interface language', () => {
    document.documentElement.lang = 'zh-CN'
    const seeds = bibleNodeKind.nodes(bibleState())
    expect(seeds.map(seed => [seed.id, seed.label, seed.title, seed.media, seed.record?.id ?? null, seed.records])).toEqual([
      ['bible:hero', '角色', 'Hero', ['shot1-last.png', 'ref.png'], 'e2', ['e1']],
      ['bible:alley', '场景', 'alley', ['alley.png'], null, []],
      ['bible:noir', '风格', 'Noir', [], null, []],
    ])
    expect(seeds.every(seed => seed.subtitle === undefined && seed.slots === undefined)).toBe(true)
    expect([bibleNodeKind.kind, bibleNodeKind.column, bibleNodeKind.label()]).toEqual(['bible', 0, '故事设定'])
    document.documentElement.lang = 'en'
    expect(bibleNodeKind.nodes(bibleState()).map(seed => seed.label)).toEqual(['Character', 'Location', 'Style'])
  })
})

describe('bibleVersionKinds', () => {
  it('reads the node, the newest versions, and the name and references of each version of its own kind', () => {
    const state = bibleState()
    const [character, location, style] = bibleVersionKinds
    expect(bibleVersionKinds.map(kind => kind.kind)).toEqual(['character', 'location', 'style'])
    expect(character?.node('hero')).toBe('bible:hero')
    expect(character?.latest(state)).toEqual([{ id: 'hero', version: 2 }])
    expect([character?.name(state, 'hero', 1), character?.assets(state, 'hero', 1)]).toEqual(['Hero', ['ref.png']])
    expect([character?.name(state, 'hero', 9), character?.assets(state, 'alley', 1)]).toEqual([null, []])
    expect([location?.latest(state), location?.name(state, 'alley', 1), style?.latest(state)])
      .toEqual([[{ id: 'alley', version: 1 }], '', [{ id: 'noir', version: 1 }]])
  })
})

describe('bibleReferencesInUse', () => {
  it('uses the producers of the references of each newest version', () => {
    expect(bibleReferencesInUse.uses(bibleState())).toEqual(['g1', 'u1'])
  })
})

describe('ui-story-bible apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers its descriptors once dvCanvas is present, and the plugin disposal removes them', async () => {
    const ctx = new Context()
    const canvas = canvasRegistries()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(canvas.nodeKinds.list()).toEqual([])
    ctx.provide('dvCanvas', canvas)
    await vi.waitFor(() => { expect(canvas.nodeKinds.list()).toEqual([bibleNodeKind]) })
    expect(canvas.takesInUse.list()).toEqual([bibleReferencesInUse])
    expect(canvas.versionKinds.list()).toEqual(bibleVersionKinds)
    await fiber.dispose()
    expect([canvas.nodeKinds.list(), canvas.takesInUse.list(), canvas.versionKinds.list()]).toEqual([[], [], []])
  })
})
