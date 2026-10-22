// @vitest-environment jsdom
/**
 * The timeline as a view of the workspace center, under the real slot runtime: the root frame stands in for the shell,
 * showing the timeline view when `dvCenter.show` names it and handing it the shown target. The center view edits the
 * project the center passes, records a picked timeline through `dvCenter.note`, inserts the asset of a
 * `dv:timeline-insert` request after showing itself, and leaves with the plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { CenterTarget, ViewTarget } from '@dv/ui-shell/contract'
import { DV_TIMELINE_INSERT_EVENT, dispatchWorkspaceEvent } from '@dv/ui-kit/workspace-events.ts'
import { scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** What the stand-in shell shows: the view that `dvCenter.show` last named and the target it handed that view. */
interface Shown {
  view: string
  target: ViewTarget | null
}

/**
 * Mount ui-timeline under a frame that renders the center view that a recording `dvCenter` shows, with project p1 and
 * chat session s5.
 * @returns the runtime, the timeline plugin's handle, the rendered page, the targets shown and noted, the written
 *   operations, and a `show` that moves the stand-in center.
 */
async function mount() {
  const { fetch, writes } = scriptedFetch()
  vi.stubGlobal('fetch', fetch)
  const runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
  let shown: Shown = { view: 'canvas', target: null }
  const targets: CenterTarget[] = []
  const noted: CenterTarget[] = []
  const listeners = new Set<() => void>()
  runtime.ctx.provide('dvCenter', {
    show(target: CenterTarget) {
      targets.push(target)
      shown = { view: target.view, target: { value: target.target, serial: targets.length } }
      for (const listener of [...listeners]) listener()
    },
    note(target: CenterTarget) { noted.push(target) },
  })
  const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  const Frame = ({ renderSlot }: PropsRenderSlots<'dv.center.view'>): ReactNode => {
    const center = useSyncExternalStore(subscribe, () => shown)
    return (
      <div data-testid="center">
        {renderSlot('dv.center.view', { projectId: 'p1', session: 's5', target: center.target }, { only: center.view })}
      </div>
    )
  }
  await runtime.root.declare({ 'dv.center.view': { kind: 'list', scope: 'root' } }, Frame)
  const plugin = await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  const operations = (): unknown[] => writes.filter(write => write.path === '/api/dv/operation').map(write => write.body)
  const show = (target: CenterTarget): void => { act(() => { runtime.ctx.dvCenter.show(target) }) }
  return { runtime, plugin, view, targets, noted, operations, show }
}

describe('timeline center view', () => {
  it('edits the project that the center passes on the timeline of its target, and notes a picked timeline as the target', async () => {
    const { view, show, noted, runtime } = await mount()
    show({ view: 'timeline', target: { timeline: 't1', clip: 'cl2' } })
    const editor = await view.findByTestId('dv-timeline-editor')
    await waitFor(() => { expect(editor.querySelector('[data-clip="cl2"]')?.getAttribute('aria-pressed')).toBe('true') })
    fireEvent.click(within(editor).getByRole('button', { name: /新建|New/ }))
    expect(noted.at(-1)).toEqual({ view: 'timeline', target: { timeline: 't2' } })
    await runtime.dispose()
  })

  it('shows itself for a dv:timeline-insert request and inserts the asset at the end of the timeline', async () => {
    const { runtime, targets, operations } = await mount()
    act(() => { dispatchWorkspaceEvent(DV_TIMELINE_INSERT_EVENT, { projectId: 'p1', assetId: 'shot1.mp4' }) })
    expect(targets).toEqual([{ view: 'timeline', target: { timeline: null } }])
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
