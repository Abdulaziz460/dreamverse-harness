/**
 * Browser half of the shot plan: the canvas node type of plans, the takes that plans use, and the History row of plan
 * records. The canvas core draws each plan as one node `plan:<PlanId>` at its latest version with the default card and
 * a frame grid of one slot per shot, and keeps the records that produced the reference assets of the latest version on
 * the canvas. The node's editor shows the plan editor, the `dv.canvas.editor` entry of the node type. The History row
 * names the plan of a `plan.create` or `plan.update` record.
 *
 * @module @dv/ui-shot-plan/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { PlanState, PlanVersion } from '@dv/shot-plan/types'
import { DvClient } from '@dv/ui-kit/api.ts'
import { pickText } from '@dv/ui-kit/locale.ts'
import type { HistoryRow, NodeEntry, NodeType, TakesInUse } from '@dv/ui-kit/registries.ts'
import { clockText } from '@dv/ui-kit/timeline.ts'
import type { WireState } from '@dv/ui-kit/types.ts'
import { PlanEditor, plansOf, totalSec } from './PlanEditor.tsx'
import type { PlanEditorInjected } from './PlanEditor.tsx'

declare module '@dv/ui-kit/types.ts' { interface ComponentStates { plan: PlanState } }

/** The package name: the key of the node type, of the takes in use, and of the editor entry. */
const ID = '@dv/ui-shot-plan'

/**
 * The plans of a state that have a version.
 * @param state - a project state.
 * @returns one entry per plan: its `PlanId`, its versions (oldest first), and its latest version.
 */
function latestPlans(state: WireState): Array<{ id: string; versions: PlanVersion[]; latest: PlanVersion }> {
  return Object.entries(plansOf(state)).flatMap(([id, versions]) => {
    const latest = versions.at(-1)
    return latest === undefined ? [] : [{ id, versions, latest }]
  })
}

/**
 * The canvas node type of plans: one entry `plan:<PlanId>` per plan in column 1 that shows its latest version (subtitle
 * `第 N 版`, title `N 个镜头 · <total duration>`) with one slot per shot. The entry's record wrote the latest version, and
 * its `records` wrote the earlier versions.
 */
export const planNodeType: NodeType = {
  id: ID,
  type: 'plan',
  label: () => pickText('分镜计划', 'Plan'),
  color: 'var(--dv-kind-plan)',
  column: 1,
  entries(state) {
    const records = new Map(state.components.proj.records.map(record => [record.id, record]))
    return latestPlans(state).map(({ id, versions, latest }): NodeEntry => {
      const count = String(latest.shots.length)
      const total = totalSec(latest)
      return {
        id: `plan:${id}`,
        record: records.get(latest.created_by) ?? null,
        records: versions.slice(0, -1).map(version => version.created_by),
        subtitle: pickText(`第 ${String(latest.version)} 版`, `v${String(latest.version)}`),
        title: `${pickText(`${count} 个镜头`, `${count} shots`)}${total === null ? '' : ` · ${clockText(total)}`}`,
        media: [],
        slots: latest.shots.length,
      }
    })
  },
}

/** The takes that plans use: the records that produced the reference assets of each plan's latest version and its shots. */
export const planReferencesInUse: TakesInUse = {
  id: ID,
  uses(state) {
    const createdBy = state.components.proj.created_by
    return latestPlans(state)
      .flatMap(({ latest }) => [...latest.references ?? [], ...latest.shots.flatMap(shot => shot.references ?? [])])
      .flatMap(reference => createdBy[reference] ?? [])
  },
}

/** @returns the text of a record field (a number as its digits), or null for an absent or empty one. */
function field(fields: Record<string, unknown> | undefined, key: string): string | null {
  const value = fields?.[key]
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The History row of every `plan.*` operation. `plan.create` names its title (`《猫》` / ` “猫”`), else its PlanId
 * (` p1`); `plan.update` names its PlanId and the version it wrote (` p1 → v2`), else its PlanId. The PlanId and the
 * version come from the report, else from the params; a plan named by its record ID comes from a project made before
 * plans had IDs and is not shown. Any other plan operation, such as a `plan.approve` record of an old log, has no
 * subject.
 */
export const planHistoryRow: HistoryRow = {
  match: 'plan.',
  subject(record) {
    const named = field(record.report, 'plan') ?? field(record.params, 'plan')
    const plan = named !== null && /^p\d+$/.test(named) ? ` ${named}` : null
    switch (record.operation) {
      case 'plan.create': {
        const title = field(record.params, 'title')
        if (title !== null) return [`《${title}》`, ` “${title}”`]
        return plan === null ? null : [plan, plan]
      }
      case 'plan.update': {
        if (plan === null) return null
        const version = field(record.report, 'version') ?? field(record.params, 'version')
        return version === null ? [plan, plan] : [`${plan} → v${version}`, `${plan} → v${version}`]
      }
      default:
        return null
    }
  },
}

/**
 * Client plugin body: while `dvCanvas` is present, register the node type of plans and the takes that plans use, and
 * with the slot registry the plan editor once a host declares `dv.canvas.editor`; while `dvHistory` is present,
 * register the History row of plan records. Each registration leaves with the service or with the plugin.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.inject(['dvCanvas'], (scope) => {
    scope.effect(() => scope.dvCanvas.nodeTypes.register(planNodeType), 'ui-shot-plan: node type')
    scope.effect(() => scope.dvCanvas.takesInUse.register(planReferencesInUse), 'ui-shot-plan: takes in use')
  })
  ctx.inject(['dvCanvas', 'slots'], (scope) => {
    const injected: PlanEditorInjected = { canvas: scope.dvCanvas, client: new DvClient() }
    scope.effect(() => scope.slots.inject('dv.canvas.editor', () => scope.slots.register(
      { name: 'dv.canvas.editor', key: ID, inject: () => injected }, PlanEditor,
    )), 'ui-shot-plan: plan editor')
  })
  ctx.inject(['dvHistory'], (scope) => {
    scope.effect(() => scope.dvHistory.rows.register(planHistoryRow), 'ui-shot-plan: history row')
  })
}
