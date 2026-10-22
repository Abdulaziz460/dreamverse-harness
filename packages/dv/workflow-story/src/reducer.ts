/**
 * The pure reducer of the story workflow: the `story` slice from the finished `story.approve` records.
 *
 * @module @dv/workflow-story/reducer
 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { RecordId, Reducer } from '@dv/project'
import type { PlanId } from '@dv/shot-plan'
import type { TimelineId } from '@dv/timeline'

/** The `story` slice: the story approvals of each plan, oldest first, and the timeline that each plan's newest approval laid out. */
export interface StoryState {
  approvals: Record<PlanId, Array<{ version: number; record: RecordId }>>
  timelines: Record<PlanId, TimelineId>
}

declare module '@dv/project' {
  interface ComponentStates {
    /** The plan approvals of the story workflow and the timeline of each approved plan (workflow-story). */
    story: StoryState
  }
}

/** The operation whose records approve a plan version for the story workflow; the renders it starts are its takes. */
export const APPROVE = 'story.approve'

/**
 * The `story` reducer: a finished `story.approve` record adds an approval of the plan and version in its report, and makes
 * the timeline in its report the plan's timeline. Other records, and records that are not `done`, leave the slice unchanged.
 */
export const storyReducer: Reducer<'story'> = {
  initial: () => ({ approvals: {}, timelines: {} }),
  reduce(slice, record) {
    const { plan, version, timeline } = record.report ?? {}
    if (record.status !== 'done' || record.operation !== APPROVE || typeof plan !== 'string' || typeof version !== 'number'
      || typeof timeline !== 'string') return slice
    const id = brandString<PlanId>(plan)
    return {
      approvals: { ...slice.approvals, [id]: [...slice.approvals[id] ?? [], { version, record: record.id }] },
      timelines: { ...slice.timelines, [id]: brandString<TimelineId>(timeline) },
    }
  },
  agentSummary(slice) {
    // Each approved plan once: the version of its newest approval and the timeline it laid out.
    return {
      story_approvals: Object.entries(slice.approvals).flatMap(([plan, approvals]) => approvals.slice(-1).map(({ version }) => ({
        plan, approved_version: version, timeline: slice.timelines[brandString<PlanId>(plan)] ?? null,
      }))),
    }
  },
}
