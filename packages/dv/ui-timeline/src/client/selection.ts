/**
 * The timeline that the right-sidebar tab body selected in each project, and the center requests of the timeline view.
 * `apply` creates one selection store and hands it to the tab body through its inject `hooks`, so the selection
 * survives a remount of the tab. The center view keeps its selection in the open project's center fields instead.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonFields } from '@dv/ui-shell/contract'

/** The selected timeline of each project that has one. */
export type TimelineSelection = Readonly<Record<string, string>>

/** The selection as an observable source, with its mutation. */
export interface TimelineSelectionStore extends HostObservable<TimelineSelection> {
  /**
   * Select a timeline of a project.
   * @param projectId - the project.
   * @param timelineId - the timeline, or null to clear the project's selection.
   */
  select: (projectId: string, timelineId: string | null) => void
}

/** @returns an empty selection store. */
export function createTimelineSelection(): TimelineSelectionStore {
  let state: TimelineSelection = {}
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    select(projectId, timelineId) {
      if ((state[projectId] ?? null) === timelineId) return
      const others = Object.entries(state).filter(([project]) => project !== projectId)
      state = Object.fromEntries(timelineId === null ? others : [...others, [projectId, timelineId]])
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * A center request of the timeline view: show a timeline and select a clip in it, as the plugin's History row asks, or
 * insert an asset into the selected timeline, as 插入片段 asks.
 */
export type TimelineRequest = { timeline: string; clip: string | null } | { insert: string }

/**
 * Read a request that the center handed the timeline view.
 * @param value - the request's value.
 * @returns the request, or null for a value that is neither form.
 */
export function readTimelineRequest(value: JsonFields): TimelineRequest | null {
  const { timeline, clip = null, insert } = value
  if (typeof insert === 'string') return { insert }
  if (typeof timeline !== 'string' || (clip !== null && typeof clip !== 'string')) return null
  return { timeline, clip }
}
