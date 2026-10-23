// @vitest-environment jsdom
/**
 * The timeline as a view of the workspace center, under the real slot runtime: the root frame stands in for the shell,
 * showing the view that `dvCenter.show` names with the request it carries, the center fields that the view notes, and
 * the view's `note`. The center view edits the project the center passes, notes a picked timeline as the `timeline`
 * center field, inserts the asset of a `dv:timeline-insert` event after showing itself, and leaves with the plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { CenterTarget } from '@dv/ui-shell/contract'
import { DV_TIMELINE_INSERT_EVENT, dispatchWorkspaceEvent } from '@dv/ui-kit/workspace-events.ts'
import { scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, inject } from '../src/client/index.ts'
import { standInCenter } from './center.client.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/**
 * Mount ui-timeline under a frame that renders the center view that a recording `dvCenter` shows, with project p1 and
 * chat session s5.
 * @returns the runtime, the timeline plugin's handle, the rendered page, the targets shown, the stand-in center, the
 *   written operations, and a `show` that moves the stand-in center.
 */
async function mount() {
  const { fetch, writes } = scriptedFetch()
  vi.stubGlobal('fetch', fetch)
  const runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
  const center = standInCenter()
  let shownView = 'canvas'
  const targets: CenterTarget[] = []
  runtime.ctx.provide('dvCenter', {
    show(target: CenterTarget) {
      targets.push(target)
      shownView = target.view
      center.show(target.target)
    },
  })
  const Frame = ({ renderSlot }: PropsRenderSlots<'dv.center.view'>): ReactNode => {
    const { fields, request } = useSyncExternalStore(listener => center.subscribe(listener), () => center.getSnapshot())
    return (
      <div data-testid="center">
        {renderSlot('dv.center.view', { projectId: 'p1', session: 's5', request, fields, note: center.note }, { only: shownView })}
      </div>
    )
  }
  await runtime.root.declare({ 'dv.center.view': { kind: 'list', scope: 'root' } }, Frame)
  const plugin = await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  const operations = (): unknown[] => writes.filter(write => write.path === '/api/dv/operation').map(write => write.body)
  const show = (target: CenterTarget): void => { act(() => { runtime.ctx.dvCenter.show(target) }) }
  return { runtime, plugin, view, targets, center, operations, show }
}

describe('timeline center view', () => {
  it('edits the project that the center passes on the timeline of its request, and notes a picked timeline as a center field', async () => {
    const { view, show, center, runtime } = await mount()
    show({ view: 'timeline', target: { timeline: 't1', clip: 'cl2' } })
    const editor = await view.findByTestId('dv-timeline-editor')
    await waitFor(() => { expect(editor.querySelector('[data-clip="cl2"]')?.getAttribute('aria-pressed')).toBe('true') })
    fireEvent.click(within(editor).getByRole('button', { name: /新建|New/ }))
    expect(center.getSnapshot().fields).toEqual({ timeline: 't2' })
    await runtime.dispose()
  })

  it('shows itself for a dv:timeline-insert event and inserts the asset at the end of the timeline', async () => {
    const { runtime, targets, operations } = await mount()
    act(() => { dispatchWorkspaceEvent(DV_TIMELINE_INSERT_EVENT, { projectId: 'p1', assetId: 'shot1.mp4' }) })
    expect(targets).toEqual([{ view: 'timeline', target: { insert: 'shot1.mp4' } }])
    await waitFor(() => {
      expect(operations()).toEqual([expect.objectContaining({
        project: 'p1', session: 's5', surface: 'timeline', operation: 'timeline.clip_insert', params: { timeline: 't1', at: 3, asset: 'shot1.mp4' },
      })])
    })
    await runtime.dispose()
  })

  it('leaves the center with the plugin, and a later dv:timeline-insert shows nothing', async () => {
    const { runtime, plugin, view, show, targets } = await mount()
    show({ view: 'timeline', target: { timeline: 't1' } })
    await view.findByTestId('dv-timeline-editor')
    await plugin.dispose()
    expect(runtime.slots.entries('dv.center.view')).toHaveLength(0)
    await waitFor(() => { expect(view.getByTestId('center').textContent).toBe('') })
    act(() => { dispatchWorkspaceEvent(DV_TIMELINE_INSERT_EVENT, { projectId: 'p1', assetId: 'shot1.mp4' }) })
    expect(targets).toHaveLength(1)
    await runtime.dispose()
  })
})
