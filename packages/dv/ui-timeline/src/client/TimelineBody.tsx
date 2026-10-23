/**
 * The right-sidebar tab body: the project and undo bar (`ProjectBar`) for choosing a project, then the timeline editor of
 * that project's current state, on the tab body's own timeline selection of each project.
 */
import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { DvClient } from '@dv/ui-kit/api.ts'
import { ProjectBar } from '@dv/ui-kit/ProjectBar.tsx'
import type { ProjectBarLabels } from '@dv/ui-kit/ProjectBar.tsx'
import type { WireState } from '@dv/ui-kit/types.ts'
import { useViewSession } from '@dv/ui-kit/useView.ts'
import type { ViewSession } from '@dv/ui-kit/useView.ts'
import { TimelineEditor } from './TimelineEditor.tsx'
import type {} from './locales.ts'
import type { TimelineSelection } from './selection.ts'

/** What the plugin hands the body beside the standard props of its DSH registration. */
export interface TimelineInjected {
  client: DvClient
  hooks: { selection: HostObservable<TimelineSelection> }
  select: (projectId: string, timelineId: string | null) => void
}

/** The body's composed props: the tab it draws, the API client, the tab body's timeline selection, and its copy. */
export type TimelineBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<TimelineInjected> & PropsLocale<'dvTimeline'>

/**
 * The project and undo bar's copy in the timeline namespace.
 * @param t - namespace-bound translate.
 * @returns the labels.
 */
export function barLabels(t: TimelineBodyProps['t']): ProjectBarLabels {
  return {
    project: t('bar.project'), undo: t('bar.undo'), newProject: t('bar.newProject'), newProjectPrompt: t('bar.newProjectPrompt'),
    noProject: t('bar.noProject'),
  }
}

type ProjectTimelineProps = Pick<TimelineBodyProps, 't' | 'useSelection' | 'select'> & {
  view: ViewSession
  project: string
  state: WireState
}

/**
 * The timeline editor of the body's chosen project, on the body's timeline selection.
 * @param props - the view session, the project and its state, the copy, and the selection.
 * @returns the element.
 */
function ProjectTimeline({ view, project, state, t, useSelection, select }: ProjectTimelineProps): ReactNode {
  const selected = useSelection(selection => selection[project] ?? null)
  const selectHere = useCallback((timelineId: string | null) => { select(project, timelineId) }, [select, project])
  return (
    <TimelineEditor
      client={view.client} t={t} project={project} session={view.session} state={state} run={view.run}
      selected={selected} select={selectHere}
    />
  )
}

/**
 * The body.
 * @param props - the API client, the selection and the copy; the tab information is unused because the tab keeps one page
 *   per kind.
 * @returns the element.
 */
export function TimelineBody({ client, t, useSelection, select }: TimelineBodyProps): ReactNode {
  const view = useViewSession(client, 'timeline')
  const labels = useMemo(() => barLabels(t), [t])
  const state = view.state.value
  let content: ReactNode
  if (view.projects.value !== null && view.projects.value.length === 0) content = <p style={{ padding: 8 }}>{t('empty.projects')}</p>
  else if (view.state.error !== null && state === null) content = <p role="alert" style={{ padding: 8 }}>{t('error', { message: view.state.error })}</p>
  else if (state === null || view.project === null) content = <p style={{ padding: 8 }}>{t('loading')}</p>
  else {
    content = (
      <ProjectTimeline view={view} project={view.project} state={state} t={t} useSelection={useSelection} select={select} />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: 12, lineHeight: '16px' }} data-testid="dv-timeline-body">
      <ProjectBar {...view.bar} labels={labels} />
      {view.notice !== null ? <p role="alert" style={{ margin: 0, padding: '4px 12px', color: 'var(--dv-danger)', fontSize: 13, lineHeight: '20px' }}>{t('error', { message: view.notice })}</p> : null}
      <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
    </div>
  )
}
