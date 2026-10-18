/**
 * The project state that the e2e stories read from `GET /api/dv/state`: the wire state of `@dv/ui-kit/types.ts`, with
 * the slices of story-bible, shot-plan, timeline and asset-pool typed by the client faces of those host packages.
 *
 * @module @dv/e2e/wire-state
 */
import type { AssetState } from '@dv/asset-pool/types'
import type { PlanVersion } from '@dv/shot-plan/types'
import type { StoryBibleState } from '@dv/story-bible/types'
import type { TimelineState } from '@dv/timeline/types'
import type { ComponentStates, WireState as KitWireState } from '@dv/ui-kit/types.ts'

export type { ProjectRecord } from '@dv/ui-kit/types.ts'

/** The project state with typed plugin slices. */
export interface WireState extends Omit<KitWireState, 'components'> {
  components: ComponentStates & {
    bible: StoryBibleState
    /** The versions of each plan of `@dv/shot-plan/types`, keyed by the plan ID text that a story names, such as `p1`. */
    plan: { plans: Readonly<Record<string, PlanVersion[]>> }
    timeline: TimelineState
    asset: AssetState
  }
}
