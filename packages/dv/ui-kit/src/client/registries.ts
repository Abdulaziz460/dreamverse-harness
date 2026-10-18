/**
 * The descriptor registries that plugin UI halves register into, as types and one factory. Each registry is a client
 * service that the UI-core package which reads it provides at its `apply` top level: `@dv/ui-history` provides
 * `dvHistory`, whose rows give the subject of a history row, and `@dv/ui-canvas` provides `dvCanvas`, whose node kinds,
 * chain anchors, takes in use and version kinds describe the canvas nodes of plugin data. A UI half registers inside
 * `ctx.inject(['dvHistory'], …)` or `ctx.inject(['dvCanvas'], …)` and keeps the disposer that `register` returns.
 *
 * @module @dv/ui-kit/registries
 */
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectRecord, WireState } from './types.ts'

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

/** The registries of the canvas, provided by `@dv/ui-canvas` as `ctx.dvCanvas`. */
export interface DvCanvas {
  /** Keyed by `id`. */
  nodeKinds: Registry<NodeKind>
  /** Keyed by `starter`. */
  chainAnchors: Registry<ChainAnchor>
  /** Keyed by `id`. */
  takesInUse: Registry<TakesInUse>
  /** Keyed by `kind`. */
  versionKinds: Registry<VersionKind>
}

/** The canvas node that the records started by one operation hang off. */
export interface ChainAnchor {
  /** The operation of a starting record. */
  starter: string
  /** The node ID that the records it started hang off, such as 'plan:p1'. */
  anchor(starter: ProjectRecord): string
  /** The approved versions of the node, read from the workflow's own slice. */
  approvedVersions?(state: WireState, anchorId: string): number[]
}

/** One kind of canvas node that a plugin draws from its own slice. */
export interface NodeKind {
  /** Package name; also the key of its 'dv.canvas.editor' slot entry. */
  id: string
  /** The data-node-kind value, such as 'bible' or 'plan'. */
  kind: string
  /** The kind label of the default card, unless the seed has its own label. */
  label(): string
  color: string
  /** Default layout column: bible 0, plan 1; takes start at 2. */
  column: number
  /** Reads only its own slice. */
  nodes(state: WireState): NodeSeed[]
}

/** One node that a `NodeKind` draws. */
export interface NodeSeed {
  id: string
  /** The record that wrote the shown version. */
  record: ProjectRecord | null
  /** Records that wrote earlier versions; a history focus on one centers this node. */
  records?: readonly string[]
  /** The kind label of this node, such as 角色 or 场景, when one NodeKind draws several kinds. */
  label?: string
  title: string
  subtitle?: string
  /** Assets the node shows; no asset node draws them again. */
  media: string[]
  /** A frame grid of n slots, which the core fills from anchored takes by chain slot. */
  slots?: number
}

/** The generation records whose outputs a plugin's data uses. */
export interface TakesInUse {
  id: string
  /** Record IDs whose outputs the plugin's data uses (timeline clips, bible and plan references). */
  uses(state: WireState): string[]
  /** Labels on the node of an asset, such as the trim badge of a clip. */
  badges?(state: WireState): Array<{ asset: string; label: string }>
}

/** How the canvas reads the versions of one reference kind of the kernel. */
export interface VersionKind {
  /** A reference kind of the kernel, such as 'character'. */
  kind: string
  /** The canvas node ID of an item, such as 'bible:c1'. */
  node(id: string): string
  /** Every item at its newest version. */
  latest(state: WireState): Array<{ id: string; version: number }>
  name(state: WireState, id: string, version: number): string | null
  /** The reference assets of the version, in order. */
  assets(state: WireState, id: string, version: number): string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dvCanvas: DvCanvas
    dvHistory: DvHistory
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The editor body of the nodes of one `NodeKind`, keyed by its `id`; `@dv/ui-canvas` renders it in a node's editor. */
    'dv.canvas.editor': { kind: 'keyed'; scope: 'root'; owner: { node: NodeSeed; state: WireState } }
  }
}
