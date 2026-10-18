// @vitest-environment jsdom
/**
 * Node kinds in `dvCanvas`: the canvas draws each seed of a registered `NodeKind` with the default card, its editor shows
 * the `dv.canvas.editor` entry keyed by the kind's `id`, and both leave when the registering plugin is disposed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate, SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { DvClient } from '@dv/ui-kit/api.ts'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { asset, fixtureState, scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
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
})

describe('node kinds', () => {
  it('draws each seed with the default card, shows the kind\'s editor entry, and removes both on disposal', async () => {
    const runtime = await SlotTestRuntime.create()
    const canvas = createDvCanvas()
    runtime.ctx.provide('dvCanvas', canvas)
    const state = fixtureState()
    state.assets.push(asset('umbrella.png', 'image/png', null), asset('umbrella-back.png', 'image/png', null))
    state.components.asset.placed = ['umbrella.png']
    const client = new DvClient(scriptedFetch({ state }).fetch)
    const t: CanvasTranslate = makeTranslate(zh)
    // The root frame declares the slot, as the canvas tab body does, and hands its renderSlot to the canvas.
    const Frame = ({ renderSlot }: PropsRenderSlots<'dv.canvas.editor'>): ReactNode =>
      <CanvasView projectId="p1" client={client} t={t} canvas={canvas} renderEditor={renderSlot} />
    await runtime.root.declare({ 'dv.canvas.editor': { kind: 'keyed', scope: 'root' } }, Frame)
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
    // The kind's column 1 is the plan column, so the seeds sit under the plan node.
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
    expect(canvas.nodeKinds.list()).toEqual([])
    await waitFor(() => { expect(card('prop:p1')).toBeNull() })
    expect(card('prop:p2')).toBeNull()
    await runtime.dispose()
  })
})
