// @vitest-environment jsdom
/**
 * The story bible's canvas node type, version kinds, references in use, `@` menu kinds and History row, and their
 * registration and removal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { AssetId, RecordId } from '@dv/project/types'
import type { CharacterId, LocationId, StyleId } from '@dv/story-bible/types'
import { projectItems } from '@dv/ui-composer/src/client/mention.ts'
import { createRegistry } from '@dv/ui-kit/registries.ts'
import type {
  ChainAnchor, DvCanvas, DvHistory, DvMentions, HistoryRow, MentionKind, NodeType, TakesInUse, VersionKind,
} from '@dv/ui-kit/registries.ts'
import type { WireState } from '@dv/ui-kit/types.ts'
import { fixtureState, record } from '../../ui-kit/tests/fixture.client.tsx'
import {
  apply, bibleHistoryRow, bibleMentionKinds, bibleNodeType, bibleReferencesInUse, bibleVersionKinds,
} from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => { document.documentElement.lang = '' })

/** @returns empty canvas registries keyed as `DvCanvas` documents. */
function canvasRegistries(): DvCanvas {
  return {
    nodeTypes: createRegistry<NodeType>(kind => [kind.id]),
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
  bible.characters['hero' as CharacterId]?.push({ id: 'hero' as CharacterId, version: 2, name: 'Hero', description: '', references: ['shot1-last.png' as AssetId, 'ref.png' as AssetId], created_by: 'e2' as RecordId })
  bible.characters['ghost' as CharacterId] = []
  bible.locations['alley' as LocationId] = [{ id: 'alley' as LocationId, version: 1, name: '', description: '', references: ['alley.png' as AssetId], created_by: 'e3' as RecordId }]
  bible.styles['noir' as StyleId] = [{ id: 'noir' as StyleId, version: 1, name: 'Noir', description: '', references: [], created_by: 'e4' as RecordId }]
  return state
}

describe('bibleNodeType', () => {
  it('draws one entry per character, location and style at its newest version, under the node type label in the interface language', () => {
    document.documentElement.lang = 'zh-CN'
    const entries = bibleNodeType.entries(bibleState())
    expect(entries.map(entry => [entry.id, entry.title, entry.media, entry.record?.id ?? null, entry.records])).toEqual([
      ['bible:hero', 'Hero', ['shot1-last.png', 'ref.png'], 'e2', ['e1']],
      ['bible:alley', 'alley', ['alley.png'], null, []],
      ['bible:noir', 'Noir', [], null, []],
    ])
    expect(entries.every(entry => entry.subtitle === undefined && entry.slots === undefined)).toBe(true)
    expect([bibleNodeType.type, bibleNodeType.column, bibleNodeType.label()]).toEqual(['bible', 0, '故事设定'])
    document.documentElement.lang = 'en'
    expect(bibleNodeType.label()).toBe('Story bible')
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

describe('bibleMentionKinds', () => {
  it('lists the newest version of each character, location and style with its name, description start and first reference', () => {
    document.documentElement.lang = 'zh-CN'
    const state = bibleState()
    expect(bibleMentionKinds.map(kind => [kind.id, kind.kind, kind.order, kind.section()])).toEqual([
      ['@dv/ui-story-bible:character', 'character', 1, '角色'],
      ['@dv/ui-story-bible:location', 'location', 2, '场景和风格'],
      ['@dv/ui-story-bible:style', 'style', 3, '场景和风格'],
    ])
    expect(bibleMentionKinds.map(kind => kind.items(state))).toEqual([
      [{ uri: 'dv:character/hero', label: 'Hero', description: '', thumb: 'shot1-last.png' }],
      [{ uri: 'dv:location/alley', label: 'alley', description: '', thumb: 'alley.png' }],
      [{ uri: 'dv:style/noir', label: 'Noir', description: '' }],
    ])
    document.documentElement.lang = 'en'
    expect(bibleMentionKinds.map(kind => kind.section())).toEqual(['Characters', 'Locations and styles', 'Locations and styles'])
  })

  it('gives the composer\'s @ list the items of the base: characters, then locations and styles, before the assets', () => {
    document.documentElement.lang = 'zh-CN'
    const items = projectItems(fixtureState(), bibleMentionKinds)
    const hero = items.find(item => item.uri === 'dv:character/hero')
    expect([hero?.label, hero?.section, hero?.description, hero?.icon !== undefined]).toEqual(['Hero', '角色', 'A tired detective.', true])
    expect(items.map(item => item.section)).toEqual(['角色', ...Array<string>(7).fill('素材')])
  })
})

describe('bibleHistoryRow', () => {
  it('names the item of a story bible record by its name, else by the ID of its kind param', () => {
    const subject = (params: Record<string, unknown>) =>
      bibleHistoryRow.subject(record({ id: 'b', component: 'bible', operation: 'bible.character_create', params }))
    expect(bibleHistoryRow.match).toBe('bible.')
    expect(subject({ character: 'c1', name: '阿明' })).toEqual(['「阿明」', ' “阿明”'])
    expect(subject({ location: 'l1', name: '' })).toEqual(['「l1」', ' “l1”'])
    expect(subject({ style: 's1' })).toEqual(['「s1」', ' “s1”'])
    expect(subject({})).toBeNull()
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
    expect(canvas.nodeTypes.list()).toEqual([])
    ctx.provide('dvCanvas', canvas)
    await vi.waitFor(() => { expect(canvas.nodeTypes.list()).toEqual([bibleNodeType]) })
    expect(canvas.takesInUse.list()).toEqual([bibleReferencesInUse])
    expect(canvas.versionKinds.list()).toEqual(bibleVersionKinds)
    await fiber.dispose()
    expect([canvas.nodeTypes.list(), canvas.takesInUse.list(), canvas.versionKinds.list()]).toEqual([[], [], []])
  })

  it('registers its mention kinds once dvMentions is present, and the plugin disposal removes them', async () => {
    const ctx = new Context()
    const mentions: DvMentions = { kinds: createRegistry<MentionKind>(kind => [kind.id]) }
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    ctx.provide('dvMentions', mentions)
    await vi.waitFor(() => { expect(mentions.kinds.list()).toEqual(bibleMentionKinds) })
    await fiber.dispose()
    expect(mentions.kinds.list()).toEqual([])
  })

  it('registers its History row once dvHistory is present, and the plugin disposal removes it', async () => {
    const ctx = new Context()
    const history: DvHistory = { rows: createRegistry<HistoryRow>(row => [row.match]) }
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    ctx.provide('dvHistory', history)
    await vi.waitFor(() => { expect(history.rows.list()).toEqual([bibleHistoryRow]) })
    await fiber.dispose()
    expect(history.rows.list()).toEqual([])
  })
})
