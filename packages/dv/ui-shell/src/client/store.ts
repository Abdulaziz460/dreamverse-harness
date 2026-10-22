/**
 * Browser state the DreamVerse shell shares between its center panel and its left navigator: the open project, the
 * center view, the latest target that `dvCenter.show` handed each view, the main chat session, and the project ↔
 * Workspace links read from `/api/dv/workspaces`. Both components live in this one bundle, so a module-level store is
 * enough.
 *
 * The location (project, view, the shown view's target, chat session) is mirrored into the URL hash, for example
 * `#project=<id>&view=<view>&target=<JSON>&session=<id>`, so a reload restores it. Every change of the open project is
 * published to the other DreamVerse bundles through `publishCurrentProject`.
 *
 * @module @dv/ui-shell/store
 */
import { useSyncExternalStore } from 'react'
import { DvClient } from '@dv/ui-kit/api.ts'
import { publishCurrentProject } from '@dv/ui-kit/current-project.ts'
import type { WireProjectLink, WireWorkspaces } from '@dv/ui-kit/types.ts'
import type { CenterTarget, Json, ViewTarget } from './contract/index.ts'

/** The client of every `/api/dv` call the shell makes. */
export const shellClient = new DvClient()

/** The project list before the links arrive; one instance so selectors return a stable value. */
export const NO_PROJECTS: WireProjectLink[] = []

/** What the shell components share. */
export interface ShellState {
  /** The main session, as the center panel last saw it. */
  sessionId: string | undefined
  /** The project open in the center, or null on the entry page. The main session follows it. */
  projectId: string | null
  /** The `id` of the `dv.center.view` entry that the center shows while a project is open, such as 'canvas'. */
  view: string
  /** The latest target that `dvCenter.show` or the URL handed each view of the open project, by view `id`. */
  targets: Readonly<Record<string, ViewTarget>>
  links: WireWorkspaces | null
}

/** The location fields of the URL hash. */
export interface ShellLocation {
  projectId: string | null
  view: string
  /** The shown view's target value, or null for none. */
  target: Json | null
  sessionId: string | undefined
}

/**
 * Read a `target` hash field, which a hand-edited URL can make malformed.
 * @param text - the field's text.
 * @returns the JSON value, or null when the text is not JSON.
 */
function parseTarget(text: string): Json | null {
  try {
    return JSON.parse(text) as Json
  } catch (error) {
    // A hash that is not JSON names no target; the view shows its default.
    void error
    return null
  }
}

/**
 * Parse the URL hash.
 * @param hash - `location.hash`.
 * @returns the location it names; missing fields take the entry-page values.
 */
export function parseLocation(hash: string): ShellLocation {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const target = params.get('target')
  return {
    projectId: params.get('project'),
    view: params.get('view') ?? 'canvas',
    target: target === null ? fieldTarget(params) : parseTarget(target),
    sessionId: params.get('session') ?? undefined,
  }
}

/** The hash fields that the shell itself reads. */
const LOCATION_FIELDS = new Set(['project', 'view', 'target', 'session'])

/**
 * The target that a hash without a `target` field names in plain fields, the form of earlier links such as
 * `timeline=t2`: every other field, as a string.
 * @param params - the hash fields.
 * @returns the fields as one object, or null when the hash has no other field.
 */
function fieldTarget(params: URLSearchParams): Json | null {
  const fields = [...params].filter(([key]) => !LOCATION_FIELDS.has(key))
  return fields.length === 0 ? null : Object.fromEntries(fields)
}

/**
 * Format a location as a URL hash; the entry page has no hash.
 * @param location - the location.
 * @returns `#project=…` with the non-default fields, or the empty string.
 */
export function formatLocation(location: ShellLocation): string {
  const params = new URLSearchParams()
  if (location.projectId !== null) {
    params.set('project', location.projectId)
    if (location.view !== 'canvas') params.set('view', location.view)
    if (location.target !== null) params.set('target', JSON.stringify(location.target))
  }
  if (location.sessionId !== undefined) params.set('session', location.sessionId)
  const text = params.toString()
  return text === '' ? '' : `#${text}`
}

/**
 * The location of a shell state, as the URL hash shows it.
 * @param shown - the shell state.
 * @returns the location, with the latest target of the shown view.
 */
export function locationOf(shown: ShellState): ShellLocation {
  return { projectId: shown.projectId, view: shown.view, target: shown.targets[shown.view]?.value ?? null, sessionId: shown.sessionId }
}

/** The serial number of the latest target, so a repeat of one target differs from the previous one. */
let serial = 0

/**
 * The view targets after a view is handed a target.
 * @param targets - the targets so far.
 * @param view - the view `id`.
 * @param value - the target value.
 * @returns the targets with the view's new, numbered target.
 */
function withTarget(targets: ShellState['targets'], view: string, value: Json): ShellState['targets'] {
  serial += 1
  return { ...targets, [view]: { value, serial } }
}

/** The location the page was loaded with, which the center restores once the client lists are ready. */
export const initialLocation: ShellLocation = parseLocation(window.location.hash)

// The main session is unknown until the center panel reports it; the URL's session is a restore target only. The shown
// view mounts from this state before the restore runs, so the URL's target is in place right away.
let state: ShellState = {
  projectId: initialLocation.projectId, view: initialLocation.view, sessionId: undefined, links: null,
  targets: initialLocation.target === null ? {} : withTarget({}, initialLocation.view, initialLocation.target),
}
const listeners = new Set<() => void>()
publishCurrentProject(state.projectId)

/** Whether the next main-session change is a user's session choice, which gets its own browser history entry. */
let sessionChoice = false
/** Whether the shell is applying a location from the URL, which must not add browser history entries. */
let applyingUrl = false
/**
 * Whether the shell state is mirrored into the URL. Until the page-load restore runs, the URL keeps what the user
 * opened or typed (a hash edited during startup included), so the restore reads it.
 */
let mirrorUrl = false

/** Start mirroring the shell state into the URL; the page-load restore calls this before it applies the URL. */
export function startUrlMirror(): void {
  mirrorUrl = true
}

/** Mark the next main-session change as the user's choice, so browser Back returns to the previous session. */
export function markSessionChoice(): void {
  sessionChoice = true
}

/**
 * Run navigation that applies a location the URL already names (reload, Back, Forward, an edited hash), so the hash
 * writes it causes replace the current history entry.
 * @param apply - the navigation; its synchronous part runs inside the scope.
 */
export function applyingLocation(apply: () => void): void {
  applyingUrl = true
  try {
    apply()
  } finally {
    applyingUrl = false
  }
}

/**
 * Merge fields into the shared state, mirror the location into the URL hash, publish a changed open project, and
 * notify subscribers when something changed. A change of project or center view, and a session the user chose, add a
 * browser history entry; other changes (a session the shell opened for a project, a target of the shown view) replace
 * the current entry.
 * @param patch - the fields to set.
 */
export function setShell(patch: Partial<ShellState>): void {
  const next = { ...state, ...patch }
  // A view target belongs to its project.
  if (next.projectId !== state.projectId && patch.targets === undefined) next.targets = {}
  if ((Object.keys(next) as Array<keyof ShellState>).every(key => Object.is(next[key], state[key]))) return
  const previous = state
  state = next
  const hash = formatLocation(locationOf(next))
  if (mirrorUrl && (hash !== formatLocation(locationOf(previous)) || hash !== window.location.hash)) {
    const moved = next.projectId !== previous.projectId || next.view !== previous.view
      || (sessionChoice && next.sessionId !== previous.sessionId)
    const url = `${window.location.pathname}${window.location.search}${hash}`
    if (moved && !applyingUrl && hash !== window.location.hash) window.history.pushState(null, '', url)
    else window.history.replaceState(window.history.state, '', url)
  }
  if (next.sessionId !== previous.sessionId) sessionChoice = false
  if (next.projectId !== previous.projectId) publishCurrentProject(next.projectId)
  for (const listener of listeners) listener()
}

/**
 * Show a view in the center and hand it a target: `dvCenter.show`.
 * @param target - the view `id` and its target value.
 */
export function showInCenter(target: CenterTarget): void {
  setShell({ view: target.view, targets: withTarget(state.targets, target.view, target.target) })
}

/**
 * Record a view's target without showing the view: `dvCenter.note`. The view keeps the serial of its last handed target,
 * so a view that applies each target once applies none for a note.
 * @param target - the view `id` and its target value.
 */
export function noteInCenter(target: CenterTarget): void {
  setShell({ targets: { ...state.targets, [target.view]: { value: target.target, serial: state.targets[target.view]?.serial ?? 0 } } })
}

/**
 * The string fields of the open project's view targets, which narrow its summary, such as the `timeline` of the
 * timeline view's target.
 * @param targets - the view targets.
 * @returns the fields; of two targets with one field, the later view's value.
 */
export function summaryFields(targets: ShellState['targets']): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.values(targets).flatMap(({ value }) => typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.entries(value).filter((field): field is [string, string] => typeof field[1] === 'string')
    : []))
}

/**
 * Show the view and the target that a URL names, keeping the view's numbered target when the URL repeats its value, so
 * Back and Forward re-hand a view only a target that changed.
 * @param view - the view `id`.
 * @param target - the URL's target value, or null when the URL names none.
 */
export function showLocation(view: string, target: Json | null): void {
  const kept = state.targets[view]
  const same = target === null || (kept !== undefined && JSON.stringify(kept.value) === JSON.stringify(target))
  setShell({ view, targets: same ? state.targets : withTarget(state.targets, view, target) })
}

/** @returns the current shared state. */
export function getShell(): ShellState {
  return state
}

/**
 * Select a value of the shared state and re-render when it changes.
 * @param select - the selector.
 * @returns the selected value.
 */
export function useShell<T>(select: (value: ShellState) => T): T {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => select(state),
  )
}

/**
 * Fetch `/api/dv/workspaces` into the shared state.
 * @returns the links.
 */
export async function refreshLinks(): Promise<WireWorkspaces> {
  const links = await shellClient.listWorkspaces()
  setShell({ links })
  return links
}

/**
 * The project a session works on: its saved binding, else the project whose Workspace holds it.
 * @param links - the links.
 * @param sessionId - the session.
 * @param workspace - the session's Workspace, when known.
 * @returns the project ID, and whether it came only from the Workspace so the binding still has to be saved.
 */
export function projectOfSession(
  links: WireWorkspaces | null,
  sessionId: string | undefined,
  workspace: { workspaceId: string; path: string } | undefined,
): { projectId: string | null; needsBind: boolean } {
  if (links === null || sessionId === undefined) return { projectId: null, needsBind: false }
  const fromWorkspace = workspace === undefined
    ? undefined
    : links.projects.find(p => p.workspace_id === workspace.workspaceId || p.path === workspace.path)?.id
  const bound = links.bindings[sessionId]
  if (bound !== undefined) return { projectId: bound, needsBind: false }
  return { projectId: fromWorkspace ?? null, needsBind: fromWorkspace !== undefined }
}
