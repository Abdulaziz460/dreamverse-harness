// @vitest-environment jsdom
/**
 * The story bible's `dv.canvas.editor` entry under the real slot runtime: the newest references and the description of
 * an item, its writes, picker and preview through the canvas host, and its removal with the plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { NodeSeed, SeedEditorHost } from '@dv/ui-kit/registries.ts'
import type { WireState } from '@dv/ui-kit/types.ts'
import { asset, fixtureState } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, bibleNodeKind } from '../src/client/index.ts'

afterEach(() => {
  cleanup()
  document.documentElement.lang = ''
})

/**
 * @param state - a project state.
 * @param id - the seed ID.
 * @returns the seed that the story bible's node kind draws with that ID.
 */
function seedOf(state: WireState, id: string): NodeSeed {
  const seed = bibleNodeKind.nodes(state).find(entry => entry.id === id)
  if (seed === undefined) throw new Error(`no seed ${id}`)
  return seed
}

describe('the story bible editor entry', () => {
  it('shows the newest references and the description, writes the next version through the host, and leaves with the plugin', async () => {
    document.documentElement.lang = 'zh-CN'
    const runtime = await SlotTestRuntime.create()
    await runtime.declare({ 'dv.canvas.editor': { kind: 'keyed', scope: 'root' } })
    const plugin = await runtime.mount({ apply })
    expect(runtime.slots.entries('dv.canvas.editor')).toHaveLength(1)
    const state = fixtureState()
    const host = { run: vi.fn<SeedEditorHost['run']>(), pickAssets: vi.fn<SeedEditorHost['pickAssets']>(), preview: vi.fn<SeedEditorHost['preview']>() }
    const slot = runtime.renderSlot('dv.canvas.editor', { node: seedOf(state, 'bible:hero'), state, host }, { entryKey: bibleNodeKind.id })
    const { container, view } = slot

    // The only reference cannot be removed: an update without references keeps the current ones.
    expect(view.getByRole('button', { name: '移除 ref.png' }).hasAttribute('disabled')).toBe(true)
    expect(view.getByText('A tired detective.')).toBeTruthy()
    const opener = view.getByRole('button', { name: '查看 ref.png' })
    fireEvent.click(opener)
    expect(host.preview).toHaveBeenCalledWith('ref.png', opener)

    // 添加素材 opens the canvas picker with the held references; the picked assets append to them.
    fireEvent.click(view.getByText('＋ 添加素材'))
    expect(host.pickAssets).toHaveBeenCalledWith(['ref.png'], expect.any(Function))
    host.pickAssets.mock.calls[0]?.[1](['ref.png', 'shot1.mp4'])
    expect(host.run).toHaveBeenLastCalledWith({
      operation: 'bible.character_update', params: { character: 'hero' },
      inputs: [{ role: 'reference', ref: 'ref.png' }, { role: 'reference', ref: 'shot1.mp4' }], intent: '在画布上给 Hero 添加参考',
    })

    // With two references, either one can be removed.
    state.components.bible.characters['hero']?.push({
      id: 'hero', version: 2, name: 'Hero', description: '', references: ['ref.png', 'shot1.mp4'], created_by: 'e1',
    })
    slot.update({ node: seedOf(state, 'bible:hero'), state, host }, { entryKey: bibleNodeKind.id })
    expect(view.queryByText('A tired detective.')).toBeNull()
    expect(container.querySelector('video')?.getAttribute('src')).toContain('shot1.mp4')
    fireEvent.click(view.getByRole('button', { name: '移除 ref.png' }))
    expect(host.run).toHaveBeenLastCalledWith({
      operation: 'bible.character_update', params: { character: 'hero' }, inputs: [{ role: 'reference', ref: 'shot1.mp4' }],
      intent: '在画布上移除 Hero 的一个参考',
    })

    await plugin.dispose()
    expect(runtime.slots.entries('dv.canvas.editor')).toHaveLength(0)
    expect(view.queryByRole('button', { name: '查看 ref.png' })).toBeNull()
    await runtime.dispose()
  })

  it('writes a location update in English, and draws nothing for a seed of no story bible item', async () => {
    document.documentElement.lang = 'en'
    const runtime = await SlotTestRuntime.create()
    await runtime.declare({ 'dv.canvas.editor': { kind: 'keyed', scope: 'root' } })
    await runtime.mount({ apply })
    const state = fixtureState()
    state.components.bible.locations['alley'] = [{ id: 'alley', version: 1, name: '', description: '', references: ['alley.png', 'ref.png'], created_by: 'e3' }]
    state.assets.push(asset('alley.png', 'image/png', null))
    const host = { run: vi.fn<SeedEditorHost['run']>(), pickAssets: vi.fn<SeedEditorHost['pickAssets']>(), preview: vi.fn<SeedEditorHost['preview']>() }
    const slot = runtime.renderSlot('dv.canvas.editor', { node: seedOf(state, 'bible:alley'), state, host }, { entryKey: bibleNodeKind.id })
    const { container, view } = slot
    expect(container.querySelector('img')?.getAttribute('src')).toContain('alley.png')
    fireEvent.click(view.getByRole('button', { name: 'Remove alley.png' }))
    expect(host.run).toHaveBeenCalledWith({
      operation: 'bible.location_update', params: { location: 'alley' }, inputs: [{ role: 'reference', ref: 'ref.png' }],
      intent: 'Remove a reference of alley from the canvas',
    })
    slot.update({ node: { id: 'bible:gone', record: null, title: 'gone', media: [] }, state, host }, { entryKey: bibleNodeKind.id })
    expect(container.textContent).toBe('')
    await runtime.dispose()
  })
})
