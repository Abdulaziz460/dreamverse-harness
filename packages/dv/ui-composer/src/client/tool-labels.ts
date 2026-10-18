/**
 * The chat's names of the agent tools: a `tool.call.toolview` row for every operation of `GET /api/dv/operations`, and
 * `tool.name.<wire name>` entries added to DSH's `chat` dictionary, which the running group title reads. The names
 * come from `operationLabel` and `DV_TOOL_LABELS` of `@dv/ui-kit/tool-labels.ts`.
 *
 * @module @dv/ui-composer/tool-labels
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { createElement } from 'react'
import { DvClient } from '@dv/ui-kit/api.ts'
import { DV_CURRENT_PROJECT_EVENT } from '@dv/ui-kit/current-project.ts'
import { DV_TOOL_LABELS, operationLabel, toolNameOf } from '@dv/ui-kit/tool-labels.ts'
import type { WireOperation } from '@dv/ui-kit/types.ts'
import { ToolLabelRow } from './views.tsx'

/**
 * Add a `tool.name.<wire name>` entry per labelled tool and per operation to the Chinese and English dictionaries of
 * DSH's `chat` namespace, which the running group title reads. The locale runtime refuses a second registration of a
 * namespace and keeps one dictionary object per namespace and language, so the entries are written into those objects;
 * the caller re-runs this when the runtime announces dictionaries registered later.
 * @param locale - `ctx.locale`.
 * @param operations - the operation declarations of `/api/dv/operations`; each operation's entry is its `operationLabel`.
 */
export function addToolNames(locale: unknown, operations: readonly WireOperation[]): void {
  const dicts: unknown = locale === undefined || locale === null ? undefined : Reflect.get(locale as object, 'dicts')
  if (!(dicts instanceof Map)) return
  const byLocale: unknown = dicts.get('chat')
  if (!(byLocale instanceof Map)) return
  const zh: unknown = byLocale.get('zh')
  const en: unknown = byLocale.get('en')
  const names = [
    ...Object.entries(DV_TOOL_LABELS),
    ...operations.map(operation => [toolNameOf(operation.name), operationLabel(operation.name, operations)] as const),
  ]
  for (const [name, [zhName, enName]] of names) {
    if (zh !== null && typeof zh === 'object') Reflect.set(zh, `tool.name.${name}`, zhName)
    if (en !== null && typeof en === 'object') Reflect.set(en, `tool.name.${name}`, enName)
  }
}

/**
 * Register a chat row and a dictionary name for every operation tool. While DSH's `tool.call.toolview` slot is declared,
 * the list of `GET /api/dv/operations` is read, and read again whenever a project opens (`dv:current-project`). Each
 * operation gets a `ToolLabelRow` keyed by its tool name at priority 1, so an entry at the default priority 0 (the render
 * card, a `DV_TOOL_LABELS` row, a plugin's own row) wins over it. When a read list differs from the shown one, every row
 * is disposed before the rows of the read list are registered, because two entries with one key and one priority throw.
 * @param ctx - the composer's client context, which injects `slots`.
 */
export function registerOperationRows(ctx: Context): void {
  const client = new DvClient()
  let operations: readonly WireOperation[] = []
  /** Tool name → the [Chinese, English] name of its operation in the shown list. */
  let labels = new Map<string, readonly [string, string]>()
  function OperationRow(props: ToolCallViewProps) {
    const label = labels.get(props.toolName) ?? [props.toolName, props.toolName]
    return createElement(ToolLabelRow, {
      label, toolName: props.toolName, sessionId: props.sessionId, callId: props.callId, phase: props.phase, block: props.block,
    })
  }
  ctx.slots.inject('tool.call.toolview', () => {
    const controller = new AbortController()
    let rows: Array<() => void> = []
    let shown = ''
    const show = (next: readonly WireOperation[]): void => {
      const key = JSON.stringify(next.map(operation => [operation.name, operation.label ?? null]))
      if (key === shown) return
      shown = key
      for (const dispose of rows) dispose()
      operations = next
      labels = new Map(next.map(operation => [toolNameOf(operation.name), operationLabel(operation.name, next)]))
      rows = next.map(operation => ctx.slots.register(
        { name: 'tool.call.toolview', key: toolNameOf(operation.name), priority: 1 }, OperationRow,
      ))
      addToolNames(ctx.get('locale'), next)
    }
    // A failed or cancelled read keeps the shown rows; the next opened project reads the list again.
    const read = (): void => { client.listOperations(controller.signal).then(show, () => undefined) }
    read()
    window.addEventListener(DV_CURRENT_PROJECT_EVENT, read)
    return () => {
      controller.abort()
      window.removeEventListener(DV_CURRENT_PROJECT_EVENT, read)
      for (const dispose of rows) dispose()
    }
  })
  ctx.effect(() => {
    const locale: unknown = ctx.get('locale')
    addToolNames(locale, operations)
    // Dictionaries registered later get the names when the runtime announces them.
    const subscribe: unknown = locale === undefined ? undefined : Reflect.get(locale as object, 'subscribe')
    if (typeof subscribe !== 'function') return () => {}
    const unsubscribe: unknown = Reflect.apply(subscribe, locale, [() => { addToolNames(locale, operations) }])
    return typeof unsubscribe === 'function' ? () => { Reflect.apply(unsubscribe, undefined, []) } : () => {}
  }, 'dv-composer: tool names in the chat')
}
