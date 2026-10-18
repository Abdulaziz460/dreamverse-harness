// @vitest-environment jsdom
/**
 * The asset pool's entries in the canvas's slots under the real slot runtime: at key `assets`, `dv.canvas.picker` is the
 * asset pool panel whose tile clicks go to the canvas, `dv.canvas.preview` is the preview of one asset, and both leave
 * with the plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { DvClient } from '@dv/ui-kit/api.ts'
import type { Asset } from '@dv/ui-kit/types.ts'
import { fixtureState, scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => { cleanup() })

describe('the canvas slots', () => {
  it('fills the picker with the asset pool panel and the preview with its preview, and both leave with the plugin', async () => {
    const runtime = await SlotTestRuntime.create()
    await runtime.declare({ 'dv.canvas.picker': { kind: 'keyed', scope: 'root' }, 'dv.canvas.preview': { kind: 'keyed', scope: 'root' } })
    runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
    const plugin = await runtime.mount({ inject: [...inject], apply })
    expect(runtime.slots.entries('dv.canvas.picker')).toHaveLength(1)
    expect(runtime.slots.entries('dv.canvas.preview')).toHaveLength(1)

    // A tile click goes to the canvas in place of the panel's own preview.
    const onOpen = vi.fn<(asset: Asset) => void>()
    const client = new DvClient(scriptedFetch().fetch)
    const picker = runtime.renderSlot('dv.canvas.picker', { projectId: 'p1', session: 's5', client, onOpen }, { entryKey: 'assets' })
    const tile = await waitFor(() => {
      const found = picker.container.querySelector('[data-asset-id="shot1.mp4"]')
      if (!(found instanceof HTMLElement)) throw new Error('no shot1.mp4 tile')
      return found
    })
    fireEvent.click(tile)
    expect(onOpen.mock.calls.map(([asset]) => asset.id)).toEqual(['shot1.mp4'])
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    // The preview renders on document.body, and its close button calls the canvas back.
    const shot = fixtureState().assets.find(asset => asset.id === 'shot1.mp4')
    if (shot === undefined) throw new Error('no shot1.mp4 asset')
    const onClose = vi.fn<() => void>()
    runtime.renderSlot('dv.canvas.preview', { asset: shot, onClose, zoom: { shown: shot, targetRef: () => undefined, fadeRef: () => undefined } }, { entryKey: 'assets' })
    const dialog = within(document.body).getByRole('dialog', { name: 'shot1.mp4' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await plugin.dispose()
    expect(runtime.slots.entries('dv.canvas.picker')).toHaveLength(0)
    expect(runtime.slots.entries('dv.canvas.preview')).toHaveLength(0)
    await waitFor(() => { expect(picker.container.querySelector('[data-testid="dv-asset-pool-panel"]')).toBeNull() })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    await runtime.dispose()
  })
})
