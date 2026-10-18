/**
 * Browser half of the shot render UI plugin: the chat card of a `dv_shot_render` call (`RenderCard`). It registers the
 * card in DSH's `tool.call.toolview` slot at the default priority 0, so the card wins over the operation row that
 * `@dv/ui-composer` registers for every operation tool at priority 1.
 *
 * @module @dv/ui-shot-render/client
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { createElement } from 'react'
import { DvClient } from '@dv/ui-kit/api.ts'
import { operationLabel } from '@dv/ui-kit/tool-labels.ts'
import { useOperations, useTaskLabels } from '@dv/ui-kit/useProject.ts'
import { RenderCard } from './RenderCard.tsx'

/** The agent tool of the shot render operation `shot.render`. */
const RENDER_TOOL = 'dv_shot_render'

/** Required service: the UI slots. */
export const inject = ['slots']

/**
 * Register the render card of `dv_shot_render` calls.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const client = new DvClient()
  function RenderRow(props: ToolCallViewProps) {
    // The label of `shot.render` in `/api/dv/operations`; until the list loads, or when the read fails, `operationLabel`
    // falls back to the tool's `DV_TOOL_LABELS` entry, else to the operation name.
    const label = operationLabel('shot.render', useOperations(client).value ?? [])
    // Until the labels load, or when the read fails, the card shows the task name.
    const taskLabels = useTaskLabels(client).value ?? {}
    return createElement(RenderCard, {
      toolName: props.toolName, label, taskLabels, sessionId: props.sessionId, callId: props.callId, phase: props.phase, block: props.block,
    })
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: RENDER_TOOL }, RenderRow))
}
