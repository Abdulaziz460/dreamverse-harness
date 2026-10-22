/**
 * The timeline plugin booted over recording services, for specs that render its components directly: the values that
 * the plugin injects into the center view and the tab body, the center targets it showed and noted through a recording
 * `dvCenter`, and the inject `hooks` bound as the renderer binds them.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { CenterTarget, ViewTarget } from '@dv/ui-shell/contract'
import type { DvClient } from '@dv/ui-kit/api.ts'
import type { TimelineInjected } from '../src/client/TimelineBody.tsx'
import { TimelineView } from '../src/client/TimelineView.tsx'
import type { TimelineCenterInjected, TimelineViewProps } from '../src/client/TimelineView.tsx'
import type { TimelineSelection } from '../src/client/selection.ts'
import { apply, inject } from '../src/client/index.ts'

/** One registration that the plugin made through the recording `ctx.slots`. */
export interface Registered {
  name: string
  key?: string
  id?: string
  inject: () => object
  component: unknown
}

/** The booted plugin. */
export interface BootedTimeline {
  ctx: Context
  fiber: Fiber
  registered: Registered[]
  /** The targets that the plugin showed through `dvCenter.show`, in order. */
  shown: CenterTarget[]
  /** The targets that the plugin noted through `dvCenter.note`, in order. */
  noted: CenterTarget[]
  center: () => TimelineCenterInjected
  tab: () => TimelineInjected
}

/**
 * Boot the plugin over recording `slots`, `locale`, `sidebarRightTabs` and `dvCenter` services.
 * @returns the booted plugin.
 */
export async function bootTimeline(): Promise<BootedTimeline> {
  const ctx = new Context()
  const registered: Registered[] = []
  const shown: CenterTarget[] = []
  const noted: CenterTarget[] = []
  ctx.provide('slots', {
    inject: (_name: string, register: () => () => void) => register(),
    register: (options: Omit<Registered, 'component'>, component: unknown) => {
      const entry: Registered = { ...options, component }
      registered.push(entry)
      return () => { registered.splice(registered.indexOf(entry), 1) }
    },
  } as never)
  ctx.provide('locale', { bind: () => (key: string) => key, register: () => () => {} } as never)
  ctx.provide('sidebarRightTabs', { register: () => () => {} } as never)
  ctx.provide('dvCenter', { show: (target: CenterTarget) => { shown.push(target) }, note: (target: CenterTarget) => { noted.push(target) } })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const injected = <T,>(name: string): () => T => () => {
    const entry = registered.find(item => item.name === name)
    if (entry === undefined) throw new Error(`no ${name} registration`)
    return entry.inject() as T
  }
  return {
    ctx, fiber, registered, shown, noted,
    center: injected<TimelineCenterInjected>('dv.center.view'),
    tab: injected<TimelineInjected>('sidebar.right.pane.tab'),
  }
}

/**
 * A selector hook over an observable source, as the renderer binds an inject `hooks` member.
 * @param source - the source.
 * @returns the hook.
 */
export function selectorHook<T>(source: HostObservable<T>): <S>(select: (value: T) => S) => S {
  return select => useSyncExternalStore(listener => source.subscribe(listener), () => select(source.getSnapshot()))
}

/** What {@link centerView} draws besides the plugin's injected values. */
export interface CenterViewOptions {
  client: DvClient
  session?: string | null
  target?: ViewTarget | null
}

/**
 * The center view of project `p1`, with the plugin's injected center values and its selection hook.
 * @param center - the plugin's injected center values.
 * @param options - the client, and the center's chat session and target.
 * @returns the element.
 */
export function centerView(center: TimelineCenterInjected, options: CenterViewOptions): ReactNode {
  const { hooks, ...rest } = center
  // The view reads none of the renderer's standing seats, so the props carry only the owner data and the injected face.
  const props = {
    ...rest, useSelection: selectorHook<TimelineSelection>(hooks.selection),
    projectId: 'p1', client: options.client, session: options.session ?? null, target: options.target ?? null,
  } as TimelineViewProps
  return <TimelineView {...props} />
}
