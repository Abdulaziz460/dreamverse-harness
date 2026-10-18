// @vitest-environment jsdom
/**
 * The canvas slots in the workspace center: under the real slot runtime, ui-canvas's `dv.center.view` entry declares the
 * canvas slots and hands them to its canvas, so the center canvas shows the slot bodies that plugin UI halves register.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, inject } from '../src/client/index.ts'
import { EDITOR_RECT_KEY } from '../src/client/NodeEditor.tsx'

/** A node kind as a plugin's UI half registers it: one seed per project. */
const PROPS: NodeKind = {
  id: '@dv/ui-prop', kind: 'prop', label: () => '道具', color: 'rgb(1, 2, 3)', column: 1,
  nodes: state => [{ id: 'prop:p1', record: null, title: `红伞 · ${state.project.id}`, media: [] }],
}

/**
 * The `dv.canvas.editor` entry of the node kind.
 * @param props - the seed.
 * @returns the element.
 */
function PropEditor({ node }: PropsRuntime<'dv.canvas.editor'>): ReactNode {
  return <p data-testid="prop-editor">{node.title}</p>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.removeItem(EDITOR_RECT_KEY)
  window.localStorage.removeItem('dv-canvas-seen:p1')
})

describe('canvas slots in the workspace center', () => {
  it('shows the editor entry of a seed in the center canvas, and leaves the center slot on disposal', async () => {
    // The plugin's own client calls the global fetch.
    vi.stubGlobal('fetch', scriptedFetch().fetch)
    const runtime = await SlotTestRuntime.create()
    runtime.ctx.provide('locale', { bind: () => (key: string) => key, register: () => () => {} } as never)
    runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
    // The root frame declares the center slot and shows its canvas entry, as the shell's workspace center does.
    const Frame = ({ renderSlot }: PropsRenderSlots<'dv.center.view'>): ReactNode =>
      <div data-testid="center">{renderSlot('dv.center.view', { projectId: 'p1', session: 's5' }, { only: 'canvas' })}</div>
    await runtime.root.declare({ 'dv.center.view': { kind: 'list', scope: 'root' } }, Frame)
    const { container, getByTestId } = runtime.renderRoot()
    const canvas = await runtime.mount({ inject: [...inject], apply })
    const prop = await runtime.mount({
      inject: ['dvCanvas', 'slots'],
      apply: (ctx: Context) => {
        ctx.effect(() => ctx.dvCanvas.nodeKinds.register(PROPS), 'test: node kind')
        ctx.effect(() => ctx.slots.inject('dv.canvas.editor', () => ctx.slots.register(
          { name: 'dv.canvas.editor', key: PROPS.id }, PropEditor,
        )), 'test: editor entry')
      },
    })
    const card = await waitFor(() => {
      const node = container.querySelector('[data-node-id="prop:p1"]')
      expect(node).not.toBeNull()
      return node as HTMLElement
    })

    fireEvent.pointerDown(card, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(container.querySelector('[data-testid="dv-canvas-view"]') as HTMLElement, { pointerId: 1 })
    const editor = await waitFor(() => within(container).getByTestId('dv-canvas-node-editor'))
    expect(within(editor).getByTestId('prop-editor').textContent).toBe('红伞 · p1')

    await prop.dispose()
    await canvas.dispose()
    expect(runtime.slots.entries('dv.center.view')).toHaveLength(0)
    await waitFor(() => { expect(getByTestId('center').textContent).toBe('') })
    await runtime.dispose()
  })
})
