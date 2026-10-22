// @vitest-environment jsdom
/** The plugin's MCP tab in the entry page's 探索 section under the real slot runtime, and its removal on dispose. */
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type {} from '@dv/ui-shell/contract'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => {
  cleanup()
  document.documentElement.lang = ''
})

describe('ui-mcp-presets apply', () => {
  it('lists the MCP tab first in 探索 with the locked tool cards while the MCP plugin is off, until the plugin is disposed', async () => {
    document.documentElement.lang = 'zh-CN'
    const runtime = await SlotTestRuntime.create()
    await runtime.root.declare({ 'dv.explore': { kind: 'list', scope: 'root' } }, props => <>{props.renderSlot('dv.explore', {})}</>)
    const plugin = await runtime.mount({ inject: [...inject], apply })
    const view = runtime.renderRoot()
    expect(runtime.slots.entries('dv.explore').map(entry => entry.options)).toEqual([{ id: 'mcp', order: 0, label: 'MCP' }])
    expect(view.getByRole('button', { name: '开启 MCP' })).toBeTruthy()
    const cards = [...view.container.querySelectorAll('[data-tool][data-state]')]
    expect(cards.map(card => [card.getAttribute('data-tool'), card.getAttribute('data-state')]))
      .toEqual([['blender', 'locked'], ['comfyui', 'locked']])

    await plugin.dispose()
    expect(runtime.slots.entries('dv.explore')).toEqual([])
    expect(view.queryByRole('button', { name: '开启 MCP' })).toBeNull()
    await runtime.dispose()
  })
})
