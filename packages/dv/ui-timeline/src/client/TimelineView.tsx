/**
 * The timeline editor for one project, without the project bar: the center area's 时间线 view. It reads the project's
 * current state itself and refetches it after every project change and every write; the view's edits go after the
 * current position of the project's history. The view applies the center target that the shell hands it (a timeline,
 * and a clip to select), records the timeline the user picks as the view's center target, and inserts the assets that
 * 插入片段 queued for its project.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ViewTarget } from '@dv/ui-shell/contract'
import type { DvClient } from '@dv/ui-kit/api.ts'
import { pickText, useLanguage } from '@dv/ui-kit/locale.ts'
import type { DvLanguage } from '@dv/ui-kit/locale.ts'
import type { OperationRequest, WireState } from '@dv/ui-kit/types.ts'
import { useProjectState } from '@dv/ui-kit/useProject.ts'
import { TimelineEditor } from './TimelineEditor.tsx'
import { en, zh } from './locales.ts'
import type { DvTimelineKey } from './locales.ts'
import type { TimelineSelection } from './selection.ts'
import { timelinesOf } from './timelines.ts'

/** What the plugin injects into the center view: the API client, the shared timeline selection and its mutations. */
export interface TimelineCenterInjected {
  client: DvClient
  hooks: { selection: HostObservable<TimelineSelection> }
  select: (projectId: string, timelineId: string | null) => void
  /** Select the timeline the user picked and record it as the timeline view's center target, which the URL keeps. */
  choose: (projectId: string, timelineId: string | null) => void
  applyTarget: (projectId: string, target: ViewTarget) => void
  takeClipFocus: () => void
  takeInserts: (projectId: string) => string[]
}

/** The center view's props: the center's owner data and the injected selection; `t` defaults to the DSH language's copy. */
export type TimelineViewProps = PropsRuntime<'dv.center.view'> & InjectFace<TimelineCenterInjected>
  & { t?: Translate<DvTimelineKey> }

/**
 * Translate from one language's dictionary, filling `{name}` placeholders.
 * @param language - the interface language.
 * @returns the translate function.
 */
export function copyFor(language: DvLanguage): Translate<DvTimelineKey> {
  const dictionary = language === 'zh' ? zh : en
  return (key, params) =>
    dictionary[key].replace(/\{(\w+)\}/g, (whole, name: string) => params !== undefined && name in params ? String(params[name]) : whole)
}

/**
 * The write that inserts an asset: a clip at the end of the selected timeline, else of the project's first timeline; in
 * a project without timelines, timeline `t1` holding the clip.
 * @param project - the project.
 * @param session - the chat session the view sits beside; null for none.
 * @param state - the project's current state.
 * @param selected - the selected timeline of the project, or null.
 * @param asset - the asset to insert.
 * @returns the operation request.
 */
function insertRequest(
  project: string, session: string | null, state: WireState, selected: string | null, asset: string,
): OperationRequest {
  const timelines = timelinesOf(state)
  const timeline = timelines.find(item => item.id === selected) ?? timelines[0]
  const at = (timeline?.clips.length ?? 0) + 1
  const call = timeline === undefined
    ? { operation: 'timeline.create', params: { timeline: 't1', assets: [asset] }, intent: pickText('新建时间线', 'Create timeline') }
    : {
      operation: 'timeline.clip_insert', params: { timeline: timeline.id, at, asset },
      intent: pickText(`在位置 ${String(at)} 插入片段`, `Insert clip at position ${String(at)}`),
    }
  return { project, ...call, surface: 'timeline', ...session === null ? {} : { session } }
}

/**
 * The timeline editor of a project's current state.
 * @param props - the center's project, chat session and target, the injected client and selection, and optionally copy.
 * @returns the element.
 */
export function TimelineView(props: TimelineViewProps): ReactNode {
  const { projectId, session, target, client, useSelection, select, choose, applyTarget, takeClipFocus, takeInserts } = props
  const language = useLanguage()
  const t = useMemo(() => props.t ?? copyFor(language), [props.t, language])
  const state = useProjectState(client, projectId)
  const selected = useSelection(selection => selection.timelines[projectId] ?? null)
  const clipFocus = useSelection(selection => selection.clipFocus)
  const inserts = useSelection(selection => selection.inserts)
  const [notice, setNotice] = useState<string | null>(null)
  const reload = state.reload
  const run = useCallback(async (work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work()
      setNotice(null)
      reload()
      return true
    } catch (failure: unknown) {
      setNotice(failure instanceof Error ? failure.message : String(failure))
      return false
    }
  }, [reload])
  useEffect(() => {
    if (target !== null) applyTarget(projectId, target)
  }, [target, projectId, applyTarget])
  useEffect(() => {
    // Insert the queued assets of this project once the state is read; a project without timelines selects the
    // created `t1`. Assets of other projects wait for a view of their own project.
    const current = state.value
    if (current === null || !inserts.some(insert => insert.projectId === projectId)) return
    for (const asset of takeInserts(projectId)) {
      const request = insertRequest(projectId, session, current, selected, asset)
      if (request.operation === 'timeline.create') select(projectId, 't1')
      void run(() => client.runOperation(request))
    }
  }, [inserts, state.value, projectId, session, selected, client, run, select, takeInserts])
  const selectHere = useCallback((timelineId: string | null) => { select(projectId, timelineId) }, [select, projectId])
  const chooseHere = useCallback((timelineId: string | null) => { choose(projectId, timelineId) }, [choose, projectId])
  if (state.value === null) {
    return <p style={{ padding: 12, color: 'var(--dv-text-2)', fontSize: 13, lineHeight: '20px' }} role={state.error === null ? undefined : 'alert'}>{state.error === null ? t('loading') : t('error', { message: state.error })}</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {notice !== null ? <p role="alert" style={{ margin: 0, padding: '4px 12px', color: 'var(--dv-danger)', fontSize: 13, lineHeight: '20px' }}>{t('error', { message: notice })}</p> : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TimelineEditor
          client={client}
          t={t}
          project={projectId}
          session={session}
          state={state.value}
          run={run}
          selected={selected}
          select={selectHere}
          choose={chooseHere}
          clipFocus={clipFocus?.projectId === projectId ? clipFocus : null}
          takeClipFocus={takeClipFocus}
        />
      </div>
    </div>
  )
}
