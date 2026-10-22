// @vitest-environment jsdom
/** The chat card of a render call (its tool's name, prompt, status, and the 在历史中查看 link once settled) and its slot entry. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { RenderCard } from '../src/client/RenderCard.tsx'

afterEach(() => { cleanup() })

describe('RenderCard', () => {
  it('names the render tool and shows the model, the task by its catalog label, and the prompt while the call renders', () => {
    render(
      <RenderCard
        toolName="dv_shot_render" label={['渲染镜头', 'Render shot']} taskLabels={{ t2v: { zh: '文字生成', en: 'From text' } }}
        sessionId="s1" callId="call-1" phase="start"
        block={{ argsRaw: JSON.stringify({ modality: 'video', task: 't2v', provider: 'fastvideo', model: 'fasth3', prompt: 'a lighthouse at dusk' }) }}
      />,
    )
    const card = document.querySelector('[data-tool="dv_shot_render"]')
    expect(card?.textContent).toContain('Render shot')
    expect(screen.getByTestId('dv-composer-render-model').textContent).toBe('fasth3 · From text')
    expect(card?.textContent).toContain('a lighthouse at dusk')
    expect(screen.queryByTestId('dv-composer-open-history')).toBeNull()
  })

  it('shows the rendered video and the history link once the call settled', () => {
    render(
      <RenderCard
        toolName="dv_shot_render" label={['渲染镜头', 'Render shot']} taskLabels={{}} sessionId="s1" callId="call-2" phase="result"
        block={{ argsRaw: '{"model":"fasth3","task":"i2v","prompt":"Picture 1 walks"}', meta: { outputs: [{ role: 'video', asset_id: 'v1.mp4', mime: 'video/mp4' }] } }}
      />,
    )
    // A task without a catalog label shows its name.
    expect(screen.getByTestId('dv-composer-render-model').textContent).toBe('fasth3 · i2v')
    expect(document.querySelector('video')?.getAttribute('src')).toContain('v1.mp4')
    expect(screen.getByTestId('dv-composer-open-history')).toBeTruthy()
  })
})

describe('the dv_shot_render row', () => {
  it('registers at the default priority ahead of an operation row at priority 1, and leaves with the plugin', async () => {
    const runtime = await SlotTestRuntime.create()
    await runtime.declare({
      'tool.call.toolview': { kind: 'keyed', scope: 'session', inject: { hooks: { toolCallArgumentsPartial: () => () => '' } } },
    })
    const entries = () => runtime.slots.entries('tool.call.toolview')
    // The operation row that @dv/ui-composer registers for every operation tool.
    await runtime.mount({
      inject: ['slots'],
      apply: (ctx: Context) => { ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'dv_shot_render', priority: 1 }, () => null)) },
    })
    const plugin = await runtime.mount({ inject, apply })
    await vi.waitFor(() => { expect(entries()).toHaveLength(2) })
    // The slot sorts a key's entries by ascending priority, and the first one renders.
    expect(entries().map(entry => [entry.options.key, entry.options.priority ?? 0])).toEqual([['dv_shot_render', 0], ['dv_shot_render', 1]])

    await plugin.dispose()
    expect(entries().map(entry => entry.options.priority)).toEqual([1])
    await runtime.dispose()
  })
})
