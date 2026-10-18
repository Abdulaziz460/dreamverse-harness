/**
 * Browser half of the shot plan: the canvas node kind of plans and the takes that plans use. The canvas core draws each
 * plan as one node `plan:<PlanId>` at its latest version with the default card and a frame grid of one slot per shot,
 * and keeps the records that produced the reference assets of the latest version on the canvas.
 *
 * @module @dv/ui-shot-plan/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { pickText } from '@dv/ui-kit/locale.ts'
import type { NodeKind, NodeSeed, TakesInUse } from '@dv/ui-kit/registries.ts'
import { clockText } from '@dv/ui-kit/timeline.ts'
import type { PlanVersion, WireState } from '@dv/ui-kit/types.ts'

/** The package name: the key of the node kind and of the takes in use. */
const ID = '@dv/ui-shot-plan'

/**
 * The plans of a state that have a version.
 * @param state - a project state.
 * @returns one entry per plan: its `PlanId`, its versions (oldest first), and its latest version.
 */
function latestPlans(state: WireState): Array<{ id: string; versions: PlanVersion[]; latest: PlanVersion }> {
  return Object.entries(state.components.plan.plans).flatMap(([id, versions]) => {
    const latest = versions.at(-1)
    return latest === undefined ? [] : [{ id, versions, latest }]
  })
}

/**
 * @param version - a plan version.
 * @returns the total duration of its shots in seconds, or null when it has no shots or a shot has no duration.
 */
function totalSec(version: PlanVersion): number | null {
  const durations = version.shots.flatMap(shot => shot.duration_sec === undefined ? [] : [shot.duration_sec])
  return durations.length > 0 && durations.length === version.shots.length ? durations.reduce((sum, duration) => sum + duration, 0) : null
}

/**
 * The canvas node kind of plans: one seed `plan:<PlanId>` per plan in column 1 that shows its latest version (subtitle
 * `第 N 版`, title `N 个镜头 · <total duration>`) with one slot per shot. The seed's record wrote the latest version, and
 * its `records` wrote the earlier versions.
 */
export const planNodeKind: NodeKind = {
  id: ID,
  kind: 'plan',
  label: () => pickText('分镜计划', 'Plan'),
  color: 'var(--dv-kind-plan)',
  column: 1,
  nodes(state) {
    const records = new Map(state.components.proj.records.map(record => [record.id, record]))
    return latestPlans(state).map(({ id, versions, latest }): NodeSeed => {
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

/**
 * Client plugin body: while `dvCanvas` is present, register the node kind of plans and the takes that plans use. Each
 * registration leaves with the service or with the plugin.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.inject(['dvCanvas'], (scope) => {
    scope.effect(() => scope.dvCanvas.nodeKinds.register(planNodeKind), 'ui-shot-plan: node kind')
    scope.effect(() => scope.dvCanvas.takesInUse.register(planReferencesInUse), 'ui-shot-plan: takes in use')
  })
}
