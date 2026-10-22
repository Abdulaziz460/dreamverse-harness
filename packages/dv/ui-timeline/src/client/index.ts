/**
 * Browser half: register `dv-timeline` as a right-Sidebar tab type, its dictionaries, and its body; while `dvCenter` is
 * present, register the timeline editor (`TimelineView`) as the 时间线 view of the workspace center (`dv.center.view`)
 * and show that view with the clip that a `dv:timeline-insert` request asks to insert; while `dvCanvas` is present,
 * register the records that the timelines use; while `dvHistory` is present, register the History row of timeline
 * records; while `dvMentions` is present, register the clip mention kind of the composer's `@` menu. The tab body and
 * the center view share one timeline selection, and each records the timeline the user picks as the timeline view's
 * center target.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@dv/ui-history/contract'
import { DvClient } from '@dv/ui-kit/api.ts'
import { DV_TIMELINE_INSERT_EVENT } from '@dv/ui-kit/workspace-events.ts'
import type { DvWorkspaceEventMap } from '@dv/ui-kit/workspace-events.ts'
import type {} from '@dv/ui-shell/contract'
import { TIMELINE_ID, timelineDefinition } from './definition.ts'
import { timelineHistoryRow } from './history-row.ts'
import { en, NS, zh } from './locales.ts'
import { clipMentionKind } from './mention.ts'
import { createTimelineSelection } from './selection.ts'
import { timelineTakesInUse } from './takes-in-use.ts'
import { TimelineBody } from './TimelineBody.tsx'
import type { TimelineInjected } from './TimelineBody.tsx'
import { TimelineView } from './TimelineView.tsx'
import type { TimelineCenterInjected } from './TimelineView.tsx'

export type { DvTimelineKey } from './locales.ts'
export type { TimelineBodyProps, TimelineInjected } from './TimelineBody.tsx'
export type { TimelineCenterInjected, TimelineViewProps } from './TimelineView.tsx'

/** Required browser services: the tab registry, the DSH UI registry, and the dictionaries. */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

/**
 * Client plugin body: register the type, its dictionaries, and its body under the type's id; while `dvCenter` is present,
 * register the center view `timeline`, which edits the project and writes for the chat session that the workspace center
 * passes, and show that view for a `dv:timeline-insert` request, whose asset the view inserts; while `dvCanvas` is
 * present, register the timeline's `TakesInUse` under the same id; while `dvHistory` is present, register the History
 * row `timeline.`, whose focus shows a record's timeline and clip; while `dvMentions` is present, register the clip
 * mention kind. Each registration leaves with its service or with the plugin.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(timelineDefinition(t)), 'ui-timeline: tab type')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-timeline: dictionaries')
  const client = new DvClient()
  const selection = createTimelineSelection()
  /** Select a picked timeline and record it as the timeline view's center target; without `dvCenter`, only select it. */
  const choose = (projectId: string, timelineId: string | null): void => {
    selection.select(projectId, timelineId)
    ctx.get('dvCenter')?.note({ view: 'timeline', target: { timeline: timelineId } })
  }
  const injected: TimelineInjected = { client, hooks: { selection }, select: selection.select, choose }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TIMELINE_ID, locale: NS, inject: () => injected },
    TimelineBody,
  )), 'ui-timeline: tab body')
  ctx.inject(['dvCenter', 'slots'], (scope) => {
    const center: TimelineCenterInjected = {
      ...injected,
      applyTarget: selection.applyTarget,
      takeClipFocus: selection.takeClipFocus,
      takeInserts: selection.takeInserts,
    }
    scope.effect(() => scope.slots.inject('dv.center.view', () => scope.slots.register(
      { name: 'dv.center.view', id: 'timeline', order: 1, label: () => t('type.label'), inject: () => center }, TimelineView,
    )), 'ui-timeline: center view')
    // 插入片段 in the asset pool's preview queues its asset for the timeline view of its project and shows that view.
    const insert = (event: Event): void => {
      const { projectId, assetId } = (event as CustomEvent<DvWorkspaceEventMap['dv:timeline-insert']>).detail
      selection.queueInsert(projectId, assetId)
      scope.dvCenter.show({ view: 'timeline', target: { timeline: selection.getSnapshot().timelines[projectId] ?? null } })
    }
    scope.effect(() => {
      window.addEventListener(DV_TIMELINE_INSERT_EVENT, insert)
      return () => { window.removeEventListener(DV_TIMELINE_INSERT_EVENT, insert) }
    }, 'ui-timeline: dv:timeline-insert')
  })
  ctx.inject(['dvCanvas'], (scope) => {
    scope.effect(() => scope.dvCanvas.takesInUse.register(timelineTakesInUse(t)), 'ui-timeline: takes in use')
  })
  ctx.inject(['dvHistory'], (scope) => {
    scope.effect(() => scope.dvHistory.rows.register(timelineHistoryRow), 'ui-timeline: history row')
  })
  ctx.inject(['dvMentions'], (scope) => {
    scope.effect(() => scope.dvMentions.kinds.register(clipMentionKind), 'ui-timeline: mention kind clip')
  })
}
