/**
 * Canvas nodes and edges derived from a project state. The canvas shows the project's current state only: a
 * node is an item a creator works with now: a character, a location or a style at its current version, an imported asset
 * on the project's canvas list (see {@link buildCanvasGraph}), a plan at its latest version, each node that a registered
 * `NodeKind` draws from its own slice, and the generation records that make up the current state: the takes of the
 * newest chain on each anchor node, every take without an anchored chain, and every take whose outputs are in use.
 * Deterministic edits (still grabs, timeline records) do not become nodes; a timeline trim shows as a badge on the take
 * it shortened.
 */
import { chainOf } from '@dv/ui-kit/chain.ts'
import type { DvLanguage } from '@dv/ui-kit/locale.ts'
import type { ChainAnchor, NodeKind, NodeSeed, TakesInUse } from '@dv/ui-kit/registries.ts'
import type {
  Character, Clip, Location, NodePosition, PlanVersion, ProjectRecord, RecordInput, StoryBibleState, Style, WireState,
  WireOperation,
} from '@dv/ui-kit/types.ts'
import { versionRefOf } from '@dv/ui-kit/references.ts'
import { isGenerationOperation, isGenerationRecord } from '@dv/ui-kit/state.ts'

/** What a node represents; the canvas colors nodes by it. A `seed` node is a node that a registered `NodeKind` drew. */
export type CanvasNodeKind = 'bible' | 'asset' | 'plan' | 'take' | 'seed'

/** The story bible kinds a `bible` node can stand for. */
export type BibleKind = 'character' | 'location' | 'style'

/** The slice key of each story bible kind. */
const BIBLE_SLICES: Record<BibleKind, keyof StoryBibleState> = { character: 'characters', location: 'locations', style: 'styles' }

/** Display states of a node. */
export interface CanvasNodeFlags {
  stale: boolean
  /** The record is pending or running. */
  rendering: boolean
  failed: boolean
  superseded: boolean
}

/** The fields of every canvas node. */
interface CanvasNodeFields {
  /** `bible:<id>` for characters, locations and styles, `plan:<PlanId>` for plans, the seed's ID for a seed, else the record ID. */
  id: string
  /** For story bible nodes, whether the node is a character, a location or a style. */
  bibleKind?: BibleKind
  /** For story bible nodes, the character, location or style ID. */
  bibleId?: string
  /** For plan nodes, the `PlanId` (`p1`). */
  planId?: string
  /** For a take, its operation's label in `/api/dv/operations`, else the operation name; shown when `title` is empty. */
  label?: string
  title: string
  subtitle: string
  /** An image asset shown as the thumbnail; null for story bible nodes, which show {@link CanvasNode.references}. */
  thumb: string | null
  /** For story bible and seed nodes, the images and videos the node shows, in order; empty for other nodes. */
  references: string[]
  /** A video or audio asset the editor plays; for a story bible or seed node, its first reference when it is a video. */
  video: string | null
  durationSec: number | null
  /** The record behind the node; for story bible, plan and seed nodes, the record that wrote the shown version. */
  record: ProjectRecord | null
  flags: CanvasNodeFlags
  /** Short labels of deterministic edits applied to the node's asset, such as `trim`. */
  badges: string[]
  /** For a take in a group of several takes (see {@link numberTakes}), this take's 1-based number; null otherwise. */
  take: number | null
  /** For a take, its anchored chain; absent for a free take. */
  chain?: AnchoredChain
  /** The default position when the user has not placed the node. */
  x: number
  y: number
}

/** One canvas node; a `seed` node carries the registered `NodeKind` that drew it and the seed it drew. */
export type CanvasNode = CanvasNodeFields & (
  | { kind: Exclude<CanvasNodeKind, 'seed'> }
  | { kind: 'seed'; nodeKind: NodeKind; seed: NodeSeed }
)

/** The anchored chain of a take: the record that started it, the node that record hangs it off, its slot and lane. */
export interface AnchoredChain {
  starter: string
  /** The anchor node ID, such as `plan:p1`. */
  anchor: string
  slot: number | null
  lane?: string
}

/** How one node fed another; a `chain` edge hangs a take off the anchor node of its chain. */
export type CanvasEdgeKind = 'reference' | 'first_frame' | 'chain' | 'take'

/** One "used as input" edge. */
export interface CanvasEdge {
  from: string
  to: string
  kind: CanvasEdgeKind
}

/** The canvas graph. */
export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  /** The node that shows each asset: its story bible node, its import node, or the nearest drawn record up its producer chain. */
  assetNodes: Record<string, string>
}

/** Width of every node card, in canvas units: a take's 16:9 frame fills it (208 × 117 at 100%). */
export const NODE_WIDTH = 208
/** Default spacing of the automatic layout, in canvas units. */
const COLUMN = 240
/** Row pitch; it leaves room for a take card (147 at 100%) whose text has grown at a low zoom. */
export const ROW = 200

/**
 * The generation operations ({@link isGenerationOperation}), whose records the canvas draws as takes.
 * @param operations - the operation declarations.
 * @param language - the interface language.
 * @returns operation name → its label in the interface language, else its name.
 */
function generationLabels(operations: readonly WireOperation[], language: DvLanguage): Map<string, string> {
  return new Map(operations
    .filter(isGenerationOperation)
    .map(operation => [operation.name, operation.label?.[language] ?? operation.name]))
}

/** The anchored chains of a project's records ({@link anchorChains}). */
interface ChainIndex {
  /** The anchored chain of a record; null for a record without a chain and for a chain without an anchor. */
  anchored: (record: ProjectRecord) => AnchoredChain | null
  /** The newest starter record of each starter operation on each anchor node. */
  newest: ReadonlySet<string>
}

/**
 * Anchor the chains of a project's records. The chain of a record (`chainOf`: its own `started_by`, else the
 * `started_by` of its `based_on` root) is anchored when its starter record is loaded and a `ChainAnchor` is registered
 * for the starter's operation.
 * @param records - the loaded records by ID, in log order.
 * @param anchors - the registered chain anchors.
 * @returns the index.
 */
function anchorChains(records: ReadonlyMap<string, ProjectRecord>, anchors: readonly ChainAnchor[]): ChainIndex {
  const anchorOf = new Map(anchors.map(anchor => [anchor.starter, anchor]))
  // The anchor node of each loaded starter, and the newest starter of each operation on each anchor node.
  const nodeOf = new Map<string, string>()
  const newest = new Map<string, string>()
  for (const record of records.values()) {
    const anchor = anchorOf.get(record.operation ?? '')
    if (anchor === undefined) continue
    const node = anchor.anchor(record)
    nodeOf.set(record.id, node)
    newest.set(`${anchor.starter}>${node}`, record.id)
  }
  return {
    anchored: (record) => {
      const chain = chainOf(record, records)
      const anchor = chain === null ? undefined : nodeOf.get(chain.record)
      if (chain === null || anchor === undefined) return null
      return { starter: chain.record, anchor, slot: chain.slot, ...chain.lane === undefined ? {} : { lane: chain.lane } }
    },
    newest: new Set(newest.values()),
  }
}

/**
 * The records whose outputs the core's own reads of the story bible, plan and timeline slices find in use: the
 * producers of the references of each current story bible and plan version, and the record of each timeline clip.
 * @param state - a project state.
 * @param plans - the latest version of each plan.
 * @returns the record IDs.
 */
function coreUses(state: WireState, plans: readonly PlanVersion[]): string[] {
  const proj = state.components.proj
  const clipRecord = (clip: Clip): string | undefined =>
    clip.source?.record ?? (clip.asset === null ? undefined : proj.created_by[clip.asset])
  const references = [
    ...bibleItems(state).flatMap(({ versions }) => versions.at(-1)?.references ?? []),
    ...plans.flatMap(latest => [...latest.references ?? [], ...latest.shots.flatMap(shot => shot.references ?? [])]),
  ]
  return [
    ...state.components.timeline.timelines.flatMap(timeline => timeline.clips.map(clipRecord)),
    ...references.map(reference => proj.created_by[reference]),
  ].filter(id => id !== undefined)
}

/**
 * The generation records the canvas draws, which make up the current state of the project:
 * - for each anchor node and each starter operation, the records of the chain that the newest starter of that operation
 *   on that node started, so the chains of two workflows on one node both show;
 * - every record in use (`used`), walking up deterministic edits such as a still grab or a timeline export;
 * - every generation record without an anchored chain (a free take);
 * - for each drawn record, the records it read its inputs from and its `based_on` family (root and retakes).
 * Records of an earlier starter's chain that nothing uses are left out, so an undo or a jump to an earlier step changes
 * what the canvas shows.
 * @param state - a project state.
 * @param isRender - whether a record generated media ({@link isGenerationRecord}); its outputs are takes the creator judges.
 * @param chains - the anchored chains of the records.
 * @param used - the records whose outputs are in use: timeline clips, references, and the `uses` of each `TakesInUse`.
 * @returns the record IDs.
 */
function drawnTakes(
  state: WireState, isRender: (record: ProjectRecord) => boolean, chains: ChainIndex, used: readonly string[],
): Set<string> {
  const proj = state.components.proj
  const records = new Map(proj.records.map(record => [record.id, record]))
  const renders = proj.records.filter(isRender)
  const rootOf = (id: string): string => {
    let current = id
    for (let depth = 0; depth < 64; depth++) {
      const base = records.get(current)?.based_on
      if (base === null || base === undefined || !records.has(base)) break
      current = base
    }
    return current
  }
  const families = new Map<string, string[]>()
  for (const render of renders) families.set(rootOf(render.id), [...families.get(rootOf(render.id)) ?? [], render.id])
  // A version reference may carry any kind key, so only a reference without `version` is a record output.
  const producerOf = (input: RecordInput): string | undefined => !('version' in input.ref) && 'record' in input.ref
    ? input.ref.record : input.resolved_asset === null ? undefined : proj.created_by[input.resolved_asset]
  // The render or import behind a record, walking up deterministic edits such as a still grab or a timeline export.
  const sourceOf = (recordId: string | undefined, depth = 0): ProjectRecord | undefined => {
    const record = recordId === undefined ? undefined : records.get(recordId)
    if (record === undefined || depth > 16 || isRender(record) || record.operation === 'asset.import') return record
    const input = record.inputs.find(entry => producerOf(entry) !== undefined)
    return input === undefined ? undefined : sourceOf(producerOf(input), depth + 1)
  }
  const takeOf = (recordId: string | undefined): string[] => {
    const source = sourceOf(recordId)
    return source !== undefined && isRender(source) ? [source.id] : []
  }
  const newestOrFree = renders.filter((render) => {
    const chain = chains.anchored(render)
    return chain === null || chains.newest.has(chain.starter)
  })
  const queue = [...newestOrFree.map(render => render.id), ...used.flatMap(takeOf)]
  const shown = new Set<string>()
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    const record = records.get(id)
    if (shown.has(id) || record === undefined) continue
    shown.add(id)
    queue.push(...record.inputs.flatMap(input => takeOf(producerOf(input))), ...families.get(rootOf(id)) ?? [])
  }
  return shown
}

/**
 * Every character, location and style of a state with its latest version.
 * @param state - a project state.
 * @returns one entry per story bible item, characters first.
 */
export function bibleItems(state: WireState): Array<{ kind: BibleKind; id: string; versions: Character[] | Location[] | Style[] }> {
  const bible = state.components.bible
  return (Object.keys(BIBLE_SLICES) as BibleKind[]).flatMap(kind =>
    Object.entries(bible[BIBLE_SLICES[kind]]).map(([id, versions]) => ({ kind, id, versions })))
}

/**
 * The versions of one character, location or style.
 * @param state - a project state.
 * @param id - the character, location or style ID.
 * @returns its versions, oldest first, or undefined when the story bible has no such ID.
 */
export function bibleVersions(state: WireState, id: string): Character[] | Location[] | Style[] | undefined {
  const bible = state.components.bible
  return bible.characters[id] ?? bible.locations[id] ?? bible.styles[id]
}

/**
 * The canvas graph of a project state, with a default layout: story bible items and assets in column 0, plans in
 * column 1, the seeds of each registered `NodeKind` in its `column`, takes from column 2 rightwards by first-frame chain
 * depth, retakes in their source take's column. A seed's media belong to its node, as a story bible item's references do.
 * Every image or video on the project's canvas (`placed`) gets one node, unless a story bible node (a reference image) or
 * a take node (a take output) already shows it: drawn from its first `asset.import` record of the current state when
 * there is one, else as `asset:<id>` with no record (an import that an undo went back past, a still, an export). A take that
 * reads an asset off the canvas has no edge from it. A take is a generation record ({@link isGenerationRecord}), titled by
 * the slot and lane of its anchored chain, else by its operation label; a take of an anchored chain hangs off the
 * chain's anchor node by a `chain` edge.
 * @param state - a project state.
 * @param placed - the assets on the canvas; defaults to the state's `asset` slice.
 * @param operations - the operation declarations; none by default, so each record's own facts decide whether it is a take.
 * @param language - the language of the operation labels.
 * @param anchors - the registered chain anchors; none by default, so every take is a free take.
 * @param inUse - the registered `TakesInUse` descriptors, whose records are drawn.
 * @param nodeKinds - the registered node kinds, whose seeds are drawn.
 * @returns the nodes and edges.
 */
export function buildCanvasGraph(
  state: WireState, placed: ReadonlySet<string> = new Set(state.components.asset.placed),
  operations: readonly WireOperation[] = [], language: DvLanguage = 'zh',
  anchors: readonly ChainAnchor[] = [], inUse: readonly TakesInUse[] = [], nodeKinds: readonly NodeKind[] = [],
): CanvasGraph {
  const proj = state.components.proj
  const assets = new Map(state.assets.map(asset => [asset.id, asset]))
  const records = new Map(proj.records.map(record => [record.id, record]))
  const isImage = (id: string | undefined): boolean => id !== undefined && assets.get(id)?.mime.startsWith('image/') === true
  const isVideo = (id: string | undefined): boolean => id !== undefined && assets.get(id)?.mime.startsWith('video/') === true
  const isAudio = (id: string | undefined): boolean => id !== undefined && assets.get(id)?.mime.startsWith('audio/') === true
  const labels = generationLabels(operations, language)
  const isRender = (record: ProjectRecord): boolean =>
    isGenerationRecord(record, operations.find(operation => operation.name === record.operation), id => assets.get(id)?.mime)
  const flagsOf = (record: ProjectRecord | null): CanvasNodeFlags => ({
    stale: record !== null && proj.stale[record.id] !== undefined,
    rendering: record !== null && (record.status === 'pending' || record.status === 'running'),
    failed: record?.status === 'failed',
    superseded: record !== null && proj.superseded[record.id] !== undefined,
  })
  const nodes: CanvasNode[] = []
  const byRecord = new Set<string>()
  const chains = anchorChains(records, anchors)
  // The latest version of each plan: the plan nodes, and the plan references in use until a UI package reports them.
  const plans = Object.entries(state.components.plan.plans).flatMap(([planId, versions]) => {
    const latest = versions.at(-1)
    return latest === undefined ? [] : [{ planId, latest }]
  })
  const used = [...coreUses(state, plans.map(plan => plan.latest)), ...inUse.flatMap(descriptor => descriptor.uses(state))]
  const takes = drawnTakes(state, isRender, chains, used)
  // The import node of each drawn imported asset.
  const importNodes = new Map<string, string>()
  // A reference image of a character, location or style, or a seed's media, belongs to that node, so its import is not
  // drawn twice.
  const mediaNode = new Map<string, string>()
  for (const { kind, id: bibleId, versions } of bibleItems(state)) {
    const latest = versions.at(-1)
    if (latest === undefined) continue
    const id = `bible:${bibleId}`
    for (const version of versions) for (const reference of version.references) mediaNode.set(reference, id)
    const record = records.get(latest.created_by) ?? null
    const references = latest.references.filter(reference => isImage(reference) || isVideo(reference))
    const first = references[0]
    nodes.push({
      id, kind: 'bible', bibleKind: kind, bibleId, title: latest.name || bibleId, subtitle: latest.description,
      thumb: null, references, video: first !== undefined && isVideo(first) ? first : null, durationSec: null, record,
      flags: flagsOf(record), badges: [], take: null, x: 0, y: 0,
    })
  }
  // One node per plan, showing its latest version; the editor switches between versions.
  for (const { planId, latest } of plans) {
    const record = records.get(latest.created_by) ?? null
    nodes.push({
      id: `plan:${planId}`, kind: 'plan', planId, title: latest.title ?? '', subtitle: String(latest.shots.length), thumb: null, references: [], video: null,
      durationSec: null, record, flags: flagsOf(record), badges: [], take: null, x: 0, y: 0,
    })
  }
  // One node per seed of each registered node kind, drawn by the core with the default card.
  for (const nodeKind of nodeKinds) {
    for (const seed of nodeKind.nodes(state)) {
      for (const media of seed.media) mediaNode.set(media, seed.id)
      const references = seed.media.filter(media => isImage(media) || isVideo(media))
      const first = references[0]
      nodes.push({
        id: seed.id, kind: 'seed', nodeKind, seed, title: seed.title, subtitle: seed.subtitle ?? '', thumb: null, references,
        video: first !== undefined && isVideo(first) ? first : null, durationSec: null, record: seed.record,
        flags: flagsOf(seed.record), badges: [], take: null, x: 0, y: 0,
      })
    }
  }
  for (const record of proj.records) {
    const label = labels.get(record.operation ?? '') ?? record.operation ?? undefined
    if (record.operation === 'asset.import') {
      // An import off the canvas stays in the asset pool only.
      const imported = record.outputs.find(id => isImage(id) || isVideo(id))
      if (imported === undefined || !placed.has(imported) || mediaNode.has(imported) || importNodes.has(imported)) continue
      importNodes.set(imported, record.id)
      nodes.push({
        id: record.id, kind: 'asset', title: assets.get(imported)?.name ?? imported, subtitle: '', thumb: isImage(imported) ? imported : null, references: [],
        video: isVideo(imported) ? imported : null, durationSec: assets.get(imported)?.duration_sec ?? null,
        record, flags: flagsOf(record), badges: [], take: null, x: 0, y: 0,
      })
    } else if (isRender(record) && takes.has(record.id)) {
      const video = record.outputs.find(id => isVideo(id) || isAudio(id)) ?? null
      const chain = chains.anchored(record)
      const slot = chain?.slot ?? null
      const title = slot === null ? '' : chain?.lane === undefined ? String(slot) : `${String(slot)} · ${chain.lane}`
      nodes.push({
        id: record.id, kind: 'take', title, ...label === undefined ? {} : { label }, ...chain === null ? {} : { chain },
        subtitle: typeof record.params['prompt'] === 'string' ? record.params['prompt'] : '',
        thumb: record.outputs.find(id => isImage(id)) ?? null, references: [], video,
        durationSec: video === null ? null : assets.get(video)?.duration_sec ?? null,
        record, flags: flagsOf(record), badges: [], take: null, x: 0, y: 0,
      })
    } else continue
    byRecord.add(record.id)
  }
  // A placed asset that no node shows yet (an import that an undo went back past, a still, an export, or another take
  // output) gets its own node, `asset:<id>`, with no record.
  const shownByTake = new Set(nodes.flatMap(node => node.kind === 'take' ? node.record?.outputs ?? [] : []))
  for (const assetId of placed) {
    const shown = mediaNode.has(assetId) || importNodes.has(assetId) || shownByTake.has(assetId)
    if (!(isImage(assetId) || isVideo(assetId)) || shown) continue
    const id = `asset:${assetId}`
    importNodes.set(assetId, id)
    nodes.push({
      id, kind: 'asset', title: assets.get(assetId)?.name ?? assetId, subtitle: '', thumb: isImage(assetId) ? assetId : null, references: [],
      video: isVideo(assetId) ? assetId : null, durationSec: assets.get(assetId)?.duration_sec ?? null,
      record: null, flags: flagsOf(null), badges: [], take: null, x: 0, y: 0,
    })
  }
  const nodeIds = new Set(nodes.map(node => node.id))
  /** The node an asset comes from: its story bible or seed node, its import node, or the nearest drawn record up its producer chain. */
  const nodeOfAsset = (assetId: string | null, depth = 0): string | null => {
    if (assetId === null) return null
    const own = mediaNode.get(assetId) ?? importNodes.get(assetId)
    if (own !== undefined) return own
    const producer = proj.created_by[assetId]
    if (producer === undefined || depth > 16) return null
    if (byRecord.has(producer)) return producer
    const produced = records.get(producer)
    // A take or an import the canvas leaves out has no node to stand for its assets.
    if (produced !== undefined && (isRender(produced) || produced.operation === 'asset.import')) return null
    const source = records.get(producer)?.inputs.find(input => input.resolved_asset !== null)?.resolved_asset
    return source === undefined || source === null ? null : nodeOfAsset(source, depth + 1)
  }
  const edges: CanvasEdge[] = []
  const seen = new Set<string>()
  const addEdge = (from: string | null, to: string, kind: CanvasEdgeKind): void => {
    if (from === null || from === to || !nodeIds.has(from)) return
    const key = `${from}>${to}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, kind })
  }
  for (const node of nodes) {
    const record = node.record
    if (record === null || node.kind === 'bible' || node.kind === 'seed') continue
    for (const input of record.inputs) {
      const bibleId = versionRefOf(input.ref)?.id
      const from = bibleId !== undefined && nodeIds.has(`bible:${bibleId}`) ? `bible:${bibleId}` : nodeOfAsset(input.resolved_asset)
      addEdge(from, node.id, input.role === 'first_frame' ? 'first_frame' : 'reference')
    }
    // A take of an anchored chain hangs off the chain's anchor node; a retake hangs there through its root.
    if (node.chain !== undefined) addEdge(node.chain.anchor, node.id, 'chain')
    if (record.based_on !== null) addEdge(record.based_on, node.id, 'take')
  }
  addBadges(state, nodes, nodeOfAsset)
  numberTakes(nodes, edges)
  layout(inTakeOrder(nodes), edges)
  const assetNodes: Record<string, string> = {}
  for (const asset of state.assets) {
    const node = nodeOfAsset(asset.id)
    if (node !== null && nodeIds.has(node)) assetNodes[asset.id] = node
  }
  return { nodes, edges, assetNodes }
}

/**
 * Number the takes of each group, so an original take and its retakes read differently on the canvas. Takes linked by
 * a take edge are one group; otherwise a take of an anchored chain is grouped by the chain's anchor, slot and lane, and a
 * free take is its own group. A group of more than one take is numbered in record order.
 * @param nodes - the drawn nodes; takes get their `take` set in place.
 * @param edges - the edges; a take edge links a retake to its source take.
 */
function numberTakes(nodes: CanvasNode[], edges: CanvasEdge[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const baseOf = new Map(edges.filter(edge => edge.kind === 'take').map(edge => [edge.to, edge.from]))
  const groupOf = (node: CanvasNode, depth = 0): string => {
    const base = byId.get(baseOf.get(node.id) ?? '')
    if (base !== undefined && depth < 64) return groupOf(base, depth + 1)
    const chain = node.chain
    return chain === undefined ? node.id : `${chain.anchor}#${String(chain.slot)}#${chain.lane ?? ''}`
  }
  const groups = new Map<string, CanvasNode[]>()
  for (const node of nodes) {
    if (node.kind !== 'take') continue
    const key = groupOf(node)
    groups.set(key, [...groups.get(key) ?? [], node])
  }
  for (const members of groups.values()) {
    if (members.length > 1) members.forEach((node, index) => { node.take = index + 1 })
  }
}

/**
 * The order in which the layout places the drawn takes: by the anchor of their chain in first-record order (a free take
 * is its own group at its own record), then slot (null last), then lane in first-record order, then record order. Take
 * numbers and slot frames read the record order of the nodes, so the order goes to the layout in a copy.
 * @param nodes - the drawn nodes, takes in record order.
 * @returns a copy of the nodes with the takes in that order; every other node keeps its place.
 */
function inTakeOrder(nodes: readonly CanvasNode[]): CanvasNode[] {
  const takes = nodes.filter(node => node.kind === 'take')
  // The position of the first take with each key, among the takes in record order.
  const firstOf = (key: (node: CanvasNode) => string): ((node: CanvasNode) => number) => {
    const first = new Map<string, number>()
    takes.forEach((node, index) => { if (!first.has(key(node))) first.set(key(node), index) })
    return node => first.get(key(node)) ?? 0
  }
  const anchor = firstOf(node => node.chain?.anchor ?? node.id)
  const lane = firstOf(node => node.chain?.lane ?? '')
  const slot = (node: CanvasNode): number => node.chain?.slot ?? Number.MAX_SAFE_INTEGER
  // The sort is stable, so takes with equal keys keep their record order.
  const ordered = takes.toSorted((a, b) => anchor(a) - anchor(b) || slot(a) - slot(b) || lane(a) - lane(b)).values()
  return nodes.map(node => node.kind === 'take' ? ordered.next().value ?? node : node)
}

/**
 * Mark takes that a timeline trims: a timeline clip with an in or out point.
 * @param state - the project state.
 * @param nodes - the drawn nodes, badged in place.
 * @param nodeOfAsset - resolves an asset to its node.
 */
function addBadges(state: WireState, nodes: CanvasNode[], nodeOfAsset: (assetId: string | null) => string | null): void {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const badge = (id: string | null, label: string): void => {
    const node = id === null ? undefined : byId.get(id)
    if (node !== undefined && !node.badges.includes(label)) node.badges.push(label)
  }
  for (const timeline of state.components.timeline.timelines) {
    for (const clip of timeline.clips) {
      if (clip.in_sec !== null || clip.out_sec !== null) badge(nodeOfAsset(clip.asset), 'trim')
    }
  }
}

/**
 * Assign default positions in place. Each column (assets, plans, seeds by their `NodeKind.column`, takes by first-frame
 * depth) wraps into several sub-columns once it holds more nodes than the shared row count, so a long shot list forms a
 * block that fits the screen. A retake sits right after its source take in the same column.
 * @param nodes - the nodes.
 * @param edges - the edges, used for first-frame depth and retake columns.
 */
function layout(nodes: CanvasNode[], edges: CanvasEdge[]): void {
  const column = new Map<string, number>()
  const incoming = (id: string, kind: CanvasEdgeKind): string[] =>
    edges.filter(edge => edge.to === id && edge.kind === kind).map(edge => edge.from)
  const columnOf = (node: CanvasNode, depth = 0): number => {
    const known = column.get(node.id)
    if (known !== undefined) return known
    let value = node.kind === 'seed' ? node.nodeKind.column : node.kind === 'plan' ? 1 : node.kind === 'take' ? 2 : 0
    if (node.kind === 'take' && depth < 64) {
      const base = incoming(node.id, 'take')[0]
      const baseNode = base === undefined ? undefined : nodes.find(candidate => candidate.id === base)
      if (baseNode !== undefined) value = columnOf(baseNode, depth + 1)
      else {
        for (const from of incoming(node.id, 'first_frame')) {
          const source = nodes.find(candidate => candidate.id === from)
          if (source?.kind === 'take') value = Math.max(value, columnOf(source, depth + 1) + 1)
        }
      }
    }
    column.set(node.id, value)
    return value
  }
  const columns = new Map<number, CanvasNode[]>()
  for (const node of nodes) {
    const col = columnOf(node)
    columns.set(col, [...columns.get(col) ?? [], node])
  }
  const baseOf = new Map(edges.filter(edge => edge.kind === 'take').map(edge => [edge.to, edge.from]))
  const tallest = Math.max(0, ...[...columns.values()].map(members => members.length))
  // About 1.5 rows per sub-column keeps a wrapped block close to the shape of a landscape screen.
  const rowsPer = Math.max(4, Math.ceil(Math.sqrt(tallest * 1.5)))
  let x = 0
  for (const col of [...columns.keys()].sort((a, b) => a - b)) {
    const members = columns.get(col) ?? []
    const ordered: CanvasNode[] = []
    const place = (node: CanvasNode): void => {
      if (ordered.includes(node)) return
      ordered.push(node)
      for (const take of members) if (baseOf.get(take.id) === node.id) place(take)
    }
    for (const node of members) if (!members.some(other => other.id === baseOf.get(node.id))) place(node)
    for (const node of members) place(node)
    ordered.forEach((node, index) => {
      node.x = x + Math.floor(index / rowsPer) * COLUMN
      node.y = (index % rowsPer) * ROW
    })
    x += Math.ceil(ordered.length / rowsPer) * COLUMN
  }
}

/** The media a node's frame grid shows for one slot. */
export interface SlotFrame {
  thumb: string | null
  video: string | null
}

/**
 * The frame of each slot of a node's frame grid: the newest finished take node whose anchored chain hangs off that node
 * with that slot (a retake has the chain of its root) and that has an image or a video.
 * @param nodes - the drawn nodes, in record order.
 * @param nodeId - the node of the grid, such as `plan:p1`.
 * @param slots - the number of slots, such as the shot count of a plan's latest version.
 * @returns one entry per slot, null for a slot without a drawn finished take.
 */
export function slotFrames(nodes: readonly CanvasNode[], nodeId: string, slots: number): Array<SlotFrame | null> {
  return Array.from({ length: slots }, (_unused, index) => {
    const take = nodes.findLast(node => node.kind === 'take' && node.record?.status === 'done' && node.chain?.anchor === nodeId
      && node.chain.slot === index + 1 && (node.thumb !== null || node.video !== null))
    return take === undefined ? null : { thumb: take.thumb, video: take.video }
  })
}

/** The least space between two node cards that {@link freePositions} keeps, in canvas units. */
const NODE_GAP = 12

/**
 * Positions for the nodes that have no stored position: each node's automatic position, moved down one row at a time
 * until its card overlaps neither a stored node nor a node placed before it. A node that appears later therefore never
 * covers a node that the user moved.
 * @param nodes - the graph's nodes, in graph order.
 * @param stored - the stored positions by node ID.
 * @param heightOf - a node's card height in canvas units.
 * @returns the positions of the nodes that had none, by node ID.
 */
export function freePositions(
  nodes: readonly CanvasNode[], stored: Readonly<Record<string, NodePosition>>, heightOf: (node: CanvasNode) => number,
): Record<string, NodePosition> {
  const boxes = nodes.flatMap((node) => {
    const at = stored[node.id]
    return at === undefined ? [] : [{ ...at, height: heightOf(node) }]
  })
  const placed: Record<string, NodePosition> = {}
  for (const node of nodes) {
    if (stored[node.id] !== undefined) continue
    const height = heightOf(node)
    let y = node.y
    const overlaps = (box: { x: number; y: number; height: number }): boolean =>
      box.x < node.x + NODE_WIDTH + NODE_GAP && node.x < box.x + NODE_WIDTH + NODE_GAP
      && box.y < y + height + NODE_GAP && y < box.y + box.height + NODE_GAP
    while (boxes.some(overlaps)) y += ROW
    placed[node.id] = { x: node.x, y }
    boxes.push({ x: node.x, y, height })
  }
  return placed
}
