// @vitest-environment jsdom
/**
 * The `@` source: the items of the registered mention kinds between the clips and the assets, the `dvMentions` registry
 * that the plugin provides, and the chip serialization when a message is sent (an asset chip places the asset on the
 * canvas).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Context } from '@deepseek-ai/cordis'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { assetUrl } from '@dv/ui-kit/api.ts'
import { publishCurrentProject } from '@dv/ui-kit/current-project.ts'
import { createRegistry, type MentionKind } from '@dv/ui-kit/registries.ts'
import { fixtureState, scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, inject } from '../src/client/index.ts'
import { projectItems, projectMentionSource, referenceText } from '../src/client/mention.ts'

afterEach(() => { vi.unstubAllGlobals(); publishCurrentProject(null); document.documentElement.lang = '' })

/** A test kind at order 2: an item whose thumb is the fixture's video `shot1.mp4`, and an item without a thumb. */
const props: MentionKind = {
  id: 'test-props', kind: 'test_prop', order: 2, section: () => 'Props',
  items: () => [{ uri: 'dv:test_prop/p1', label: 'Umbrella', description: 'red', thumb: 'shot1.mp4' }, { uri: 'dv:test_prop/p2', label: 'Hat' }],
}
/** A test kind at order 1 whose item's thumb is the fixture's image `ref.png`. */
const marks: MentionKind = {
  id: 'test-marks', kind: 'test_mark', order: 1, section: () => 'Marks', items: () => [{ uri: 'dv:test_mark/m1', label: 'X', thumb: 'ref.png' }],
}

/** @returns the markup of an item's icon, or null for an item without one. */
function iconOf(item: { icon?: ComponentType }): string | null {
  return item.icon === undefined ? null : renderToStaticMarkup(createElement(item.icon))
}

describe('projectItems', () => {
  it('lists the items of each mention kind by order under its section, then the assets', () => {
    document.documentElement.lang = 'zh-CN'
    const items = projectItems(fixtureState(), [props, marks])
    expect(items.map(item => [item.uri, item.section])).toEqual([
      ['dv:test_mark/m1', 'Marks'], ['dv:test_prop/p1', 'Props'], ['dv:test_prop/p2', 'Props'],
      ...['export-last.png', 'export.mp4', 'shot2-last.png', 'shot2.mp4', 'shot1-last.png', 'shot1.mp4', 'ref.png']
        .map(asset => [`dv:asset/${asset}`, '素材']),
    ])
    const [mark, umbrella, hat] = items.slice(0, 3)
    expect([umbrella?.label, umbrella?.description, hat?.description]).toEqual(['Umbrella', 'red', undefined])
    // A thumb is an asset ID: a video shows its first frame, an image shows as an image.
    expect(iconOf(umbrella ?? {})).toContain(`<video src="${assetUrl('shot1.mp4')}"`)
    expect(iconOf(mark ?? {})).toContain(`<img src="${assetUrl('ref.png')}"`)
    expect(iconOf(hat ?? {})).toBeNull()
  })

  it('lists no clip and no reference noun item without a registered kind', () => {
    expect(projectItems(fixtureState(), []).some(item => item.uri.startsWith('dv:clip/') || item.uri.startsWith('dv:character/'))).toBe(false)
  })
})

describe('ui-composer apply', () => {
  it('provides dvMentions, whose kinds reach the @ source until their disposal, and removes it with the plugin', async () => {
    vi.stubGlobal('fetch', scriptedFetch().fetch)
    publishCurrentProject('p1')
    const ctx = new Context()
    const sources: InputTriggerSource[] = []
    ctx.provide('inputTriggers', {
      registerSource: (source: InputTriggerSource) => {
        sources.push(source)
        return () => { sources.splice(sources.indexOf(source), 1) }
      },
    } as never)
    ctx.provide('sessions', {} as never)
    ctx.provide('slots', { inject: () => () => undefined, register: () => () => undefined } as never)
    ctx.provide('sidebarRight', {} as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const names = async (): Promise<string[]> => {
      const candidates = await sources[0]?.candidates({} as never, { query: 'umbrella', signal: new AbortController().signal } as never)
      return (candidates ?? []).map(candidate => candidate.name)
    }
    const dispose = ctx.dvMentions.kinds.register(props)
    expect(ctx.dvMentions.kinds.list()).toEqual([props])
    expect(await names()).toEqual(['Umbrella'])
    dispose()
    expect(ctx.dvMentions.kinds.list()).toEqual([])
    expect(await names()).toEqual([])
    await fiber.dispose()
    expect(ctx.get('dvMentions')).toBeUndefined()
    expect(sources).toEqual([])
  })
})

describe('projectMentionSource codec', () => {
  it('sends the chip text unchanged and writes nothing; the host puts mentioned assets on the canvas', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (input: string) => {
      calls.push(input)
      return Promise.resolve(new Response('{}'))
    })
    publishCurrentProject('p1')
    const { codec } = projectMentionSource({ kinds: createRegistry<MentionKind>(kind => [kind.id]) })
    if (codec === undefined) throw new Error('the source has no codec')
    const asset = referenceText('hero.png', 'dv:asset/a%2B1')
    const character = referenceText('Hero', 'dv:character/hero')
    expect(await codec.serialize(asset, new AbortController().signal)).toBe(asset)
    expect(await codec.serialize(character, new AbortController().signal)).toBe(character)
    expect(calls).toEqual([])
  })
})
