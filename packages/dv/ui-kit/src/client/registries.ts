/**
 * The descriptor registries that plugin UI halves register into, as types and one factory. Each registry is a client
 * service that the UI-core package which reads it provides at its `apply` top level: `@dv/ui-history` provides
 * `dvHistory`, whose rows give the subject of a history row. A UI half registers inside `ctx.inject(['dvHistory'], …)`
 * and keeps the disposer that `register` returns.
 *
 * @module @dv/ui-kit/registries
 */
import type {} from '@deepseek-ai/cordis'
import type { ProjectRecord } from './types.ts'

/** A list of descriptors that plugins add and remove, with one owner per key. */
export interface Registry<D> {
  /** Throws on a key that another descriptor already holds. */
  register(descriptor: D): () => void
  /** The same array until a change. */
  list(): readonly D[]
  subscribe(listener: () => void): () => void
}

/**
 * Create an empty registry.
 * @param keys - the keys a descriptor holds; two descriptors never share one.
 * @returns the registry.
 */
export function createRegistry<D>(keys: (descriptor: D) => readonly string[]): Registry<D> {
  let items: readonly D[] = []
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  return {
    register(descriptor) {
      const taken = new Set(items.flatMap(keys))
      const clash = keys(descriptor).find(key => taken.has(key))
      if (clash !== undefined) throw new Error(`registry key "${clash}" is already registered`)
      items = [...items, descriptor]
      notify()
      return () => {
        if (!items.includes(descriptor)) return
        items = items.filter(item => item !== descriptor)
        notify()
      }
    },
    list: () => items,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** The registries of the History panel, provided by `@dv/ui-history` as `ctx.dvHistory`. */
export interface DvHistory {
  /** Keyed by `match`. */
  rows: Registry<HistoryRow>
}

/** How the History panel names the records of one operation, or of every operation of a component key. */
export interface HistoryRow {
  /** An operation name, or '<key>.' for every operation of a component key. */
  match: string
  /** The subject after the label, with its own separator, such as [' p1 v1', ' p1 v1'] or ['「红伞」', ' “Red umbrella”'];
   *  null for none. */
  subject(record: ProjectRecord): readonly [zh: string, en: string] | null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dvHistory: DvHistory
  }
}
