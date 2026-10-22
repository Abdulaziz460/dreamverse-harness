/**
 * The timeline selection that the plugin's editors share: the selected timeline of each project, the clip that a center
 * target asked to select, and the assets that 插入片段 queued. `apply` creates one store and hands it to the center
 * view, the right-sidebar tab body and the 插入片段 action through their inject `hooks`.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { Json, ViewTarget } from '@dv/ui-shell/contract'

/** A clip that a center target asked to select, until the editor that shows its timeline takes it. */
export interface ClipFocus {
  projectId: string
  timelineId: string
  clipId: string
}

/** An asset that 插入片段 queued for the center view of its project. */
export interface QueuedInsert {
  projectId: string
  assetId: string
}

/** The shared selection. */
export interface TimelineSelection {
  /** The selected timeline of each project that has one. */
  timelines: Readonly<Record<string, string>>
  clipFocus: ClipFocus | null
  inserts: readonly QueuedInsert[]
}

/** The selection as an observable source, with its mutations. */
export interface TimelineSelectionStore extends HostObservable<TimelineSelection> {
  /**
   * Select a timeline of a project.
   * @param projectId - the project.
   * @param timelineId - the timeline, or null to clear the project's selection.
   */
  select: (projectId: string, timelineId: string | null) => void
  /**
   * Apply a center target of the timeline view once per serial: select its timeline and, with a clip, keep the clip for
   * the editor that shows that timeline. A target whose value is not a timeline target changes nothing.
   * @param projectId - the project the center shows.
   * @param target - the target that the center handed the view.
   */
  applyTarget: (projectId: string, target: ViewTarget) => void
  /** Drop the clip focus once an editor showing its timeline took it. */
  takeClipFocus: () => void
  /**
   * Queue an asset for the center view of its project.
   * @param projectId - the project.
   * @param assetId - the asset.
   */
  queueInsert: (projectId: string, assetId: string) => void
  /**
   * Remove and return the queued assets of one project.
   * @param projectId - the project.
   * @returns the asset IDs, in queue order.
   */
  takeInserts: (projectId: string) => string[]
}

/**
 * Read the timeline view's target value: `{ timeline: string | null, clip?: string | null }`. The value can come from
 * the URL hash, so every field is checked.
 * @param value - the target value.
 * @returns the timeline and the clip, or null when the value is not a timeline target.
 */
export function parseTimelineTarget(value: Json): { timelineId: string | null; clipId: string | null } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const fields = value as { readonly [key: string]: Json }
  const timelineId = fields['timeline'] ?? null
  const clipId = fields['clip'] ?? null
  if ((timelineId !== null && typeof timelineId !== 'string') || (clipId !== null && typeof clipId !== 'string')) return null
  return { timelineId, clipId }
}

/** @returns an empty selection store. */
export function createTimelineSelection(): TimelineSelectionStore {
  let state: TimelineSelection = { timelines: {}, clipFocus: null, inserts: [] }
  let applied: number | null = null
  const listeners = new Set<() => void>()
  const publish = (next: TimelineSelection): void => {
    state = next
    for (const listener of [...listeners]) listener()
  }
  const select = (projectId: string, timelineId: string | null): void => {
    if ((state.timelines[projectId] ?? null) === timelineId) return
    const others = Object.entries(state.timelines).filter(([project]) => project !== projectId)
    publish({ ...state, timelines: Object.fromEntries(timelineId === null ? others : [...others, [projectId, timelineId]]) })
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    select,
    applyTarget(projectId, target) {
      if (applied === target.serial) return
      applied = target.serial
      const parsed = parseTimelineTarget(target.value)
      if (parsed?.timelineId == null) return
      select(projectId, parsed.timelineId)
      if (parsed.clipId !== null) publish({ ...state, clipFocus: { projectId, timelineId: parsed.timelineId, clipId: parsed.clipId } })
    },
    takeClipFocus() {
      if (state.clipFocus !== null) publish({ ...state, clipFocus: null })
    },
    queueInsert(projectId, assetId) {
      publish({ ...state, inserts: [...state.inserts, { projectId, assetId }] })
    },
    takeInserts(projectId) {
      const taken = state.inserts.filter(insert => insert.projectId === projectId).map(insert => insert.assetId)
      if (taken.length > 0) publish({ ...state, inserts: state.inserts.filter(insert => insert.projectId !== projectId) })
      return taken
    },
  }
}
