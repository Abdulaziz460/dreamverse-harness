/**
 * The timeline editor for one project, without the project bar: the center area's 时间线 view. It reads the project's
 * current state itself and refetches it after every project change and every write; the view's edits go after the
 * current position of the project's history. It also inserts the assets that `dv:timeline-insert` requests for its
 * project (插入片段 in the 素材库 panel).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { DvClient } from '@dv/ui-kit/api.ts'
import { getTimelineOf, publishCurrentTimeline } from '@dv/ui-kit/current-timeline.ts'
import { pickText, useLanguage } from '@dv/ui-kit/locale.ts'
import type { DvLanguage } from '@dv/ui-kit/locale.ts'
import type { OperationRequest, WireState } from '@dv/ui-kit/types.ts'
import { useProjectState } from '@dv/ui-kit/useProject.ts'
import { DV_TIMELINE_INSERT_EVENT } from '@dv/ui-kit/workspace-events.ts'
import type { DvWorkspaceEventMap } from '@dv/ui-kit/workspace-events.ts'
import { TimelineEditor } from './TimelineEditor.tsx'
import { en, zh } from './locales.ts'
import type { DvTimelineKey } from './locales.ts'
import { timelinesOf } from './timelines.ts'

/** What the center switcher passes; `client` and `t` default to a same-origin client and the copy of the DSH language. */
export interface TimelineViewProps {
  projectId: string
  client?: DvClient
  /** The chat session the view sits beside, recorded as the `session` of the view's edits. */
  session?: string | null
  t?: Translate<DvTimelineKey>
}

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

const sharedClient = new DvClient()

// A `dv:timeline-insert` request usually arrives while the center shows another view (the shell shows the timeline view
// in response), so the module keeps each request until a mounted view of its project has the state to insert it into.
let pendingInserts: readonly DvWorkspaceEventMap['dv:timeline-insert'][] = []
const insertListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener(DV_TIMELINE_INSERT_EVENT, (event) => {
    pendingInserts = [...pendingInserts, (event as CustomEvent<DvWorkspaceEventMap['dv:timeline-insert']>).detail]
    for (const listener of insertListeners) listener()
  })
}

/**
 * The write that inserts an asset: a clip at the end of the timeline selected in the editor, else of the project's first
 * timeline; in a project without timelines, timeline `t1` holding the clip.
 * @param project - the project.
 * @param session - the chat session the view sits beside; null for none.
 * @param state - the project's current state.
 * @param asset - the asset to insert.
 * @returns the operation request.
 */
function insertRequest(project: string, session: string | null, state: WireState, asset: string): OperationRequest {
  const timelines = timelinesOf(state)
  const timeline = timelines.find(item => item.id === getTimelineOf(project)) ?? timelines[0]
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
 * @param props - the project, and optionally the API client, the chat session, and copy.
 * @returns the element.
 */
export function TimelineView({ projectId, client = sharedClient, session = null, t: givenCopy }: TimelineViewProps): ReactNode {
  const language = useLanguage()
  const t = useMemo(() => givenCopy ?? copyFor(language), [givenCopy, language])
  const state = useProjectState(client, projectId)
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
  const [insertRequests, setInsertRequests] = useState(0)
  useEffect(() => {
    const listener = (): void => { setInsertRequests(count => count + 1) }
    insertListeners.add(listener)
    return () => { insertListeners.delete(listener) }
  }, [])
  useEffect(() => {
    // Insert the requested assets of this project once the state is read; a project without timelines selects the
    // created `t1`. Requests of other projects wait for a view of their own project.
    const current = state.value
    const assets = pendingInserts.filter(request => request.projectId === projectId).map(request => request.assetId)
    if (current === null || assets.length === 0) return
    pendingInserts = pendingInserts.filter(request => request.projectId !== projectId)
    for (const asset of assets) {
      const request = insertRequest(projectId, session, current, asset)
      if (request.operation === 'timeline.create') publishCurrentTimeline(projectId, 't1')
      void run(() => client.runOperation(request))
    }
  }, [insertRequests, state.value, projectId, session, client, run])
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
        />
      </div>
    </div>
  )
}
