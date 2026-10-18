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
import { apply as assetPoolApply, inject as assetPoolInject } from '@dv/ui-asset-pool/src/client/index.ts'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { apply as storyBibleApply } from '@dv/ui-story-bible/src/client/index.ts'
import { scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply as shotPlanApply } from '../../ui-shot-plan/src/client/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { EDITOR_RECT_KEY } from '../src/client/NodeEditor.tsx'
import { zh } from '../src/client/locales.ts'

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
  document.documentElement.lang = ''
})

/**
 * A slot runtime whose root frame declares the center slot and shows its canvas entry, as the shell's workspace center
 * does, with the ui-canvas plugin mounted on the fixture project.
 * @returns the runtime, the rendered root, and the mounted ui-canvas plugin.
 */
async function centerCanvas() {
  // The plugin's own client calls the global fetch.
  vi.stubGlobal('fetch', scriptedFetch().fetch)
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('locale', { bind: () => (key: string) => key, register: () => () => {} } as never)
  runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
  const Frame = ({ renderSlot }: PropsRenderSlots<'dv.center.view'>): ReactNode =>
    <div data-testid="center">{renderSlot('dv.center.view', { projectId: 'p1', session: 's5' }, { only: 'canvas' })}</div>
  await runtime.root.declare({ 'dv.center.view': { kind: 'list', scope: 'root' } }, Frame)
  const view = runtime.renderRoot()
  const canvas = await runtime.mount({ inject: [...inject], apply })
  return { runtime, view, canvas }
}

/**
 * Open the editor of a drawn node with a click.
 * @param container - the rendered root.
 * @param id - the node ID.
 * @returns the editor.
 */
async function openEditor(container: HTMLElement, id: string): Promise<HTMLElement> {
  const card = await waitFor(() => {
    const node = container.querySelector(`[data-node-id="${id}"]`)
    expect(node).not.toBeNull()
    return node as HTMLElement
  })
  fireEvent.pointerDown(card, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
  fireEvent.pointerUp(container.querySelector('[data-testid="dv-canvas-view"]') as HTMLElement, { pointerId: 1 })
  return waitFor(() => within(container).getByTestId('dv-canvas-node-editor'))
}

describe('canvas slots in the workspace center', () => {
  it('shows the editor entry of a seed in the center canvas, and leaves the center slot on disposal', async () => {
    const { runtime, view: { container, getByTestId }, canvas } = await centerCanvas()
    const prop = await runtime.mount({
      inject: ['dvCanvas', 'slots'],
      apply: (ctx: Context) => {
        ctx.effect(() => ctx.dvCanvas.nodeKinds.register(PROPS), 'test: node kind')
        ctx.effect(() => ctx.slots.inject('dv.canvas.editor', () => ctx.slots.register(
          { name: 'dv.canvas.editor', key: PROPS.id }, PropEditor,
        )), 'test: editor entry')
      },
    })
    const editor = await openEditor(container, 'prop:p1')
    expect(within(editor).getByTestId('prop-editor').textContent).toBe('红伞 · p1')

    await prop.dispose()
    await canvas.dispose()
    expect(runtime.slots.entries('dv.center.view')).toHaveLength(0)
    await waitFor(() => { expect(getByTestId('center').textContent).toBe('') })
    await runtime.dispose()
  })

  it('shows the story bible editor body in the center canvas', async () => {
    document.documentElement.lang = 'zh-CN'
    const { runtime, view: { container } } = await centerCanvas()
    await runtime.mount({ apply: storyBibleApply })

    const editor = await openEditor(container, 'bible:hero')
    // The body of the ui-story-bible entry: the reference of the newest version, the description and 添加素材.
    expect(within(editor).getByRole('button', { name: '查看 ref.png' })).toBeTruthy()
    expect(within(editor).getByText('A tired detective.')).toBeTruthy()
    expect(within(editor).getByText('＋ 添加素材')).toBeTruthy()
    await runtime.dispose()
  })

  it('shows the plan editor body in the center canvas', async () => {
    document.documentElement.lang = 'zh-CN'
    const { runtime, view: { container } } = await centerCanvas()
    await runtime.mount({ apply: shotPlanApply })

    const editor = await openEditor(container, 'plan:p1')
    // The body of the ui-shot-plan entry: the version row with its status, and one card per shot.
    expect(within(editor).getByRole('group', { name: '分镜计划版次' })).toBeTruthy()
    expect(within(editor).getByTestId('dv-canvas-plan-status').textContent).toBe('待批准')
    expect(editor.querySelectorAll('li[data-shot]')).toHaveLength(2)
    await runtime.dispose()
  })

  it('shows the asset pool tiles in the asset picker and the asset preview in the center canvas', async () => {
    document.documentElement.lang = 'zh-CN'
    const { runtime, view } = await centerCanvas()
    await runtime.mount({ inject: [...assetPoolInject], apply: assetPoolApply })

    const editor = await openEditor(view.container, 'g1')
    // 添加素材 opens the picker, which shows the asset pool's `dv.canvas.picker` entry below the versioned items.
    fireEvent.click(within(editor).getByText(zh['editor.addAsset']))
    const picker = await view.findByTestId('dv-canvas-asset-picker')
    const tile = await waitFor(() => {
      const found = picker.querySelector('[data-asset-id="shot1.mp4"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    fireEvent.click(tile)
    fireEvent.click(view.getByText('确认（1）'))
    // The picked asset's chip opens the asset pool's `dv.canvas.preview` entry.
    fireEvent.click(within(editor).getByRole('button', { name: '查看 shot1.mp4' }))
    expect(await view.findByRole('dialog', { name: 'shot1.mp4' })).toBeTruthy()
    await runtime.dispose()
  })
})
