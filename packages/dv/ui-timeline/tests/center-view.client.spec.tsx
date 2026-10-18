// @vitest-environment jsdom
/**
 * The timeline as a view of the workspace center: under the real slot runtime, the plugin's `dv.center.view` entry draws
 * the timeline editor of the project that the center passes, inserts a `dv:timeline-insert` asset for the chat session
 * that the center passes, and leaves the slot when the plugin is disposed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { DV_TIMELINE_INSERT_EVENT, dispatchWorkspaceEvent } from '@dv/ui-kit/workspace-events.ts'
import { scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('timeline center view', () => {
  it('edits the project the center passes, inserts for the center\'s chat session, and leaves the slot on disposal', async () => {
    // The plugin's own client calls the global fetch.
    const { fetch, writes } = scriptedFetch()
    vi.stubGlobal('fetch', fetch)
    const runtime = await SlotTestRuntime.create()
    runtime.ctx.provide('locale', { bind: () => (key: string) => key, register: () => () => {} } as never)
    runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
    // The root frame declares the slot and shows its timeline entry, as the shell's workspace center does.
    const Frame = ({ renderSlot }: PropsRenderSlots<'dv.center.view'>): ReactNode =>
      <div data-testid="center">{renderSlot('dv.center.view', { projectId: 'p1', session: 's5' }, { only: 'timeline' })}</div>
    await runtime.root.declare({ 'dv.center.view': { kind: 'list', scope: 'root' } }, Frame)
    const { findByTestId, getByTestId } = runtime.renderRoot()
    const plugin = await runtime.mount({ inject: [...inject], apply })
    await findByTestId('dv-timeline-editor')

    act(() => { dispatchWorkspaceEvent(DV_TIMELINE_INSERT_EVENT, { projectId: 'p1', assetId: 'shot1.mp4' }) })
    await waitFor(() => {
      expect(writes.find(write => write.path === '/api/dv/operation')?.body).toMatchObject({
        project: 'p1', session: 's5', operation: 'timeline.clip_insert', params: { timeline: 't1', at: 3, asset: 'shot1.mp4' },
      })
    })

    await plugin.dispose()
    expect(runtime.slots.entries('dv.center.view')).toHaveLength(0)
    await waitFor(() => { expect(getByTestId('center').textContent).toBe('') })
    await runtime.dispose()
  })
})
