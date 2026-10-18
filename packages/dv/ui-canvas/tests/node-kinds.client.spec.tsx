// @vitest-environment jsdom
/**
 * Node kinds in `dvCanvas`: the canvas draws each seed of a registered `NodeKind` with the default card, its editor shows
 * the `dv.canvas.editor` entry keyed by the kind's `id` and lends it the canvas's writes, asset picker and asset preview
 * (the asset pool's `dv.canvas.picker` and `dv.canvas.preview` entries), and both leave when the registering plugin is
 * disposed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate, SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { apply as assetPoolApply, inject as assetPoolInject } from '@dv/ui-asset-pool/src/client/index.ts'
import { DvClient } from '@dv/ui-kit/api.ts'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { apply as storyBibleApply, bibleNodeKind } from '@dv/ui-story-bible/src/client/index.ts'
import { asset, fixtureState, scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { planNodeKind } from '../../ui-shot-plan/src/client/index.ts'
import { CanvasView } from '../src/client/CanvasView.tsx'
import { createDvCanvas } from '../src/client/dv-canvas.ts'
import { EDITOR_RECT_KEY } from '../src/client/NodeEditor.tsx'
import type { CanvasTranslate } from '../src/client/NodeCard.tsx'
import { zh } from '../src/client/locales.ts'

/** A node kind as a plugin's UI half registers it: one seed with media, one seed with a frame grid. */
const PROPS: NodeKind = {
  id: '@dv/ui-prop', kind: 'prop', label: () => '道具', color: 'rgb(1, 2, 3)', column: 1,
  nodes: state => state.project.id === 'p1'
    ? [
      { id: 'prop:p1', record: null, title: '红伞', subtitle: '第 1 版', media: ['umbrella.png', 'umbrella-back.png'] },
      { id: 'prop:p2', record: null, label: '分镜板', title: '2 格', media: [], slots: 2 },
    ]
    : [],
}

/** The slots that the canvas center view declares for its editors. */
type CanvasSlot = 'dv.canvas.editor' | 'dv.canvas.picker' | 'dv.canvas.preview'
const CANVAS_SLOTS = {
  'dv.canvas.editor': { kind: 'keyed', scope: 'root' },
  'dv.canvas.picker': { kind: 'keyed', scope: 'root' },
  'dv.canvas.preview': { kind: 'keyed', scope: 'root' },
} as const

/**
 * The `dv.canvas.editor` entry of the node kind.
 * @param props - the seed and the state.
 * @returns the element.
 */
function PropEditor({ node, state }: PropsRuntime<'dv.canvas.editor'>): ReactNode {
  return <p data-testid="prop-editor">{`${node.title} · ${state.project.id}`}</p>
}

afterEach(() => {
  cleanup()
  window.localStorage.removeItem(EDITOR_RECT_KEY)
  window.localStorage.removeItem('dv-canvas-seen:p1')
  document.documentElement.lang = ''
})

describe('node kinds', () => {
  it('draws each seed with the default card, shows the kind\'s editor entry, and removes both on disposal', async () => {
    const runtime = await SlotTestRuntime.create()
    const canvas = createDvCanvas()
    // The story bible's seeds hold column 0, as in the bundle, so the plan stays in the column it had before the kind came.
    canvas.nodeKinds.register(bibleNodeKind)
    canvas.nodeKinds.register(planNodeKind)
    runtime.ctx.provide('dvCanvas', canvas)
    const state = fixtureState()
    state.assets.push(asset('umbrella.png', 'image/png', null), asset('umbrella-back.png', 'image/png', null))
    state.components.asset.placed = ['umbrella.png']
    const client = new DvClient(scriptedFetch({ state }).fetch)
    const t: CanvasTranslate = makeTranslate(zh)
    // The root frame declares the slots, as the canvas center view does, and hands its renderSlot to the canvas.
    const Frame = ({ renderSlot }: PropsRenderSlots<CanvasSlot>): ReactNode =>
      <CanvasView projectId="p1" client={client} t={t} canvas={canvas} renderSlot={renderSlot} />
    await runtime.root.declare(CANVAS_SLOTS, Frame)
    const { container } = runtime.renderRoot()
    const card = (id: string): HTMLElement | null => container.querySelector(`[data-node-id="${id}"]`)
    await waitFor(() => { expect(card('g1')).not.toBeNull() })
    expect(card('prop:p1')).toBeNull()

    const kinds = await runtime.mount({
      inject: ['dvCanvas'],
      apply: (ctx: Context) => { ctx.effect(() => ctx.dvCanvas.nodeKinds.register(PROPS), 'test: node kind') },
    })
    const editors = await runtime.mount({
      inject: ['slots'],
      apply: (ctx: Context) => {
        ctx.effect(() => ctx.slots.inject('dv.canvas.editor', () => ctx.slots.register(
          { name: 'dv.canvas.editor', key: PROPS.id }, PropEditor,
        )), 'test: editor entry')
      },
    })
    await waitFor(() => { expect(card('prop:p1')).not.toBeNull() })
    const media = card('prop:p1')
    expect(media?.getAttribute('data-node-kind')).toBe('prop')
    expect(media?.textContent).toBe('道具 · 第 1 版+1红伞')
    expect(media?.querySelector('img')?.getAttribute('src')).toContain('umbrella.png')
    expect(media?.innerHTML).toContain('background: rgb(1, 2, 3)')
    // A seed with slots reads like a plan card: its label above its title, with no grid while no slot has a frame.
    expect(card('prop:p2')?.textContent).toBe('分镜板2 格')
    // The kind's column 1 is also the column of the plan kind, so the seeds sit under the plan node.
    expect(card('prop:p1')?.style.left).toBe(card('plan:p1')?.style.left)
    // The seed's media belong to its node, so the placed umbrella image has no asset node of its own.
    expect(card('asset:umbrella.png')).toBeNull()

    fireEvent.pointerDown(card('prop:p1') as HTMLElement, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(container.querySelector('[data-testid="dv-canvas-view"]') as HTMLElement, { pointerId: 1 })
    const editor = await waitFor(() => within(container).getByTestId('dv-canvas-node-editor'))
    expect(within(editor).getByTestId('prop-editor').textContent).toBe('红伞 · p1')

    await editors.dispose()
    expect(runtime.slots.entries('dv.canvas.editor')).toHaveLength(0)
    await waitFor(() => { expect(within(editor).queryByTestId('prop-editor')).toBeNull() })
    expect(within(editor).getByRole('heading').textContent).toBe('红伞')

    await kinds.dispose()
    expect(canvas.nodeKinds.list()).toEqual([bibleNodeKind, planNodeKind])
    await waitFor(() => { expect(card('prop:p1')).toBeNull() })
    expect(card('prop:p2')).toBeNull()
    await runtime.dispose()
  })

  it('lends the editor entry its writes, picker and preview: the story bible entry previews a reference and appends picked assets', async () => {
    document.documentElement.lang = 'zh-CN'
    const runtime = await SlotTestRuntime.create()
    const canvas = createDvCanvas()
    runtime.ctx.provide('dvCanvas', canvas)
    const scripted = scriptedFetch()
    const client = new DvClient(scripted.fetch)
    const t: CanvasTranslate = makeTranslate(zh)
    // The asset pool fills the picker and the preview slots.
    const Frame = ({ renderSlot }: PropsRenderSlots<CanvasSlot>): ReactNode =>
      <CanvasView projectId="p1" client={client} session="s5" t={t} canvas={canvas} renderSlot={renderSlot} />
    await runtime.root.declare(CANVAS_SLOTS, Frame)
    await runtime.mount({ apply: storyBibleApply })
    runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
    await runtime.mount({ inject: [...assetPoolInject], apply: assetPoolApply })
    const { container } = runtime.renderRoot()
    const hero = await waitFor(() => {
      const found = container.querySelector('[data-node-id="bible:hero"]')
      if (!(found instanceof HTMLElement)) throw new Error('no bible:hero node')
      return found
    })
    fireEvent.pointerDown(hero, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(container.querySelector('[data-testid="dv-canvas-view"]') as HTMLElement, { pointerId: 1 })
    const editor = await waitFor(() => within(container).getByTestId('dv-canvas-node-editor'))
    // The entry's reference opens the canvas's preview; Escape closes the preview and leaves the editor open.
    fireEvent.click(within(editor).getByRole('button', { name: '查看 ref.png' }))
    const view = within(document.body)
    expect(await view.findByRole('dialog', { name: 'ref.png' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => { expect(view.queryByRole('dialog', { name: 'ref.png' })).toBeNull() })
    // 添加素材 opens the canvas's picker of assets only; the write carries the canvas's project, session and surface.
    fireEvent.click(within(editor).getByText('＋ 添加素材'))
    const picker = await view.findByTestId('dv-canvas-asset-picker')
    expect(picker.textContent).not.toContain('角色')
    const tile = await waitFor(() => {
      const found = picker.querySelector('[data-asset-id="shot1.mp4"]')
      if (!(found instanceof HTMLElement)) throw new Error('no shot1.mp4 tile')
      return found
    })
    fireEvent.click(tile)
    fireEvent.click(view.getByText('确认（1）'))
    expect(view.queryByTestId('dv-canvas-asset-picker')).toBeNull()
    await waitFor(() => { expect(scripted.writes.some(write => write.path === '/api/dv/operation')).toBe(true) })
    expect(scripted.writes.find(write => write.path === '/api/dv/operation')?.body).toEqual({
      project: 'p1', operation: 'bible.character_update', params: { character: 'hero' },
      inputs: [{ role: 'reference', ref: 'ref.png' }, { role: 'reference', ref: 'shot1.mp4' }], intent: '在画布上给 Hero 添加参考',
      surface: 'canvas', session: 's5',
    })
    await runtime.dispose()
  })
})
