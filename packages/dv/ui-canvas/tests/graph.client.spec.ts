// @vitest-environment jsdom
/** Canvas nodes and edges derived from the shared project state. */
import { describe, expect, it } from 'vitest'
import type { ChainAnchor, NodeType, TakesInUse } from '@dv/ui-kit/registries.ts'
import type { DvLanguage } from '@dv/ui-kit/locale.ts'
import type { AssetId, RecordId } from '@dv/project/types'
import type { PlanId, PlanVersion } from '@dv/shot-plan/types'
import type { ClipId, TimelineId } from '@dv/timeline/types'
import type { ProjectRecord, WireOperation, WireState } from '@dv/ui-kit/types.ts'
import { formatInputRef } from '@dv/ui-kit/references.ts'
import { defineReferenceUi } from '@dv/ui-kit/reference-kit.tsx'
import { asset, fixtureState, OPERATIONS, record, withTestRef } from '../../ui-kit/tests/fixture.client.tsx'
import { planNodeType } from '../../ui-shot-plan/src/client/index.ts'
import { buildCanvasGraph, freePositions, NODE_WIDTH, ROW, slotFrames } from '../src/client/graph.ts'
import type { CanvasGraph, CanvasNode } from '../src/client/graph.ts'

/** The reference noun `test_ref` of the fixture, declared as the UI package of a noun declares it. */
const testRef = defineReferenceUi({
  id: '@dv/ui-test-ref', key: 'test_ref', slice: state => state.components.test_ref ?? {},
  label: ['参考', 'Reference'], mention: { section: ['参考', 'References'], order: 1 },
})

/**
 * The canvas graph with the node type, references in use and version kind of `test_ref` registered, as the bundle
 * mounts the UI package of a noun.
 * @param state - the state.
 * @param placed - the assets on the canvas.
 * @param operations - the operation declarations.
 * @param language - the label language.
 * @param anchors - the chain anchors.
 * @param inUse - other `TakesInUse` descriptors, such as the timeline clips.
 * @param nodeTypes - other node types, such as the plan's.
 * @returns the graph.
 */
function refGraph(
  state: WireState, placed?: ReadonlySet<string>, operations: readonly WireOperation[] = [], language: DvLanguage = 'zh',
  anchors: readonly ChainAnchor[] = [], inUse: readonly TakesInUse[] = [], nodeTypes: readonly NodeType[] = [],
): CanvasGraph {
  const uses = [testRef.referencesInUse, ...inUse]
  return buildCanvasGraph(state, placed, operations, language, anchors, uses, [testRef.nodeType, ...nodeTypes], [testRef.versionKind])
}

/**
 * @param node - a drawn node.
 * @returns its `data-node-type`: the `NodeType.type` of an entry, else the core type.
 */
function typeOf(node: CanvasNode): string {
  return node.type === 'entry' ? node.nodeType.type : node.type
}

/** A chain anchor of each approval operation: the records an approval started hang off the node of its plan. */
const anchorOf = (starter: string): ChainAnchor => ({ starter, anchor: approval => `plan:${String(approval.params['plan'])}` })
const APPROVAL = anchorOf('plan.approve')

/**
 * A `TakesInUse` of the timeline clips, as a timeline UI half reports them: the producer of each clip's asset, and the label
 * `trim` on the asset of each clip with an in point.
 */
const CLIPS: TakesInUse = {
  id: 'clips',
  uses: state => state.components.timeline.timelines.flatMap(timeline => timeline.clips)
    .flatMap(clip => state.components.proj.created_by[clip.asset ?? ''] ?? []),
  badges: state => state.components.timeline.timelines.flatMap(timeline => timeline.clips)
    .filter(clip => clip.in_sec !== null).map(clip => ({ asset: clip.asset ?? '', label: 'trim' })),
}

/** Six shot prompts of plan p1 version 1; versions 2 and 3 change shot 3 and add shot 7, version 4 returns to these. */
const PROMPTS = ['rain', 'alley', 'door', 'stairs', 'roof', 'dawn']

/**
 * A project shaped like a creator's real one: plan p1 v1 with 6 shots approved and rendered (r1–r6); v2 changes shot 3
 * and adds shot 7 (s3, s7), with a retake of shot 7 (x7); v3 changes shot 5 (w5); the agent then put the v1 take of shot
 * 3 back on the timeline and wrote v4 equal to v1, whose approval reuses every v1 take. Records after `until` are left
 * out, as an undo or a jump to that record leaves the state.
 * @param until - the last record ID kept; every record by default.
 * @returns the state.
 */
function rollbackProject(until?: string): WireState {
  const hero = { role: 'reference', ref: { test_ref: 'hero', version: 1 }, resolved_asset: 'ref.png' }
  // The approval of version n is a<n>: it starts each render, with its shot as slot, and its timeline record; a retake
  // has no started_by of its own.
  const render = (id: string, version: number, shot: number, basedOn: string | null = null): ProjectRecord => record({
    id, operation: 'shot.render', deterministic: false, inputs: [hero], based_on: basedOn, outputs: [`${id}.mp4`, `${id}.png`],
    params: { prompt: `shot ${String(shot)} v${String(version)}`, plan: 'p1', plan_version: version, shot },
    ...basedOn === null ? { started_by: { record: `a${String(version)}`, slot: shot } } : {},
  })
  const layout = (id: string, operation: string, clips: string[]): ProjectRecord => record({
    id, operation, params: { timeline: 't1', plan: 'p1' }, started_by: { record: `a${id.slice(1)}`, slot: null },
    inputs: clips.map(clip => ({ role: 'clip', ref: { record: clip, output: 0 }, resolved_asset: `${clip}.mp4` })),
  })
  const approve = (id: string, version: number, scheduled: string[]): ProjectRecord =>
    record({ id, operation: 'plan.approve', params: { plan: 'p1', version }, report: { plan: 'p1', version, scheduled } })
  const v1 = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']
  const all = [
    record({ id: 'u1', operation: 'asset.import', params: { name: 'ref.png' }, outputs: ['ref.png'] }),
    record({ id: 'e1', operation: 'test_ref.create', params: { test_ref: 'hero', name: 'Hero' } }),
    record({ id: 'q1', operation: 'plan.create', report: { plan: 'p1', version: 1 } }),
    approve('a1', 1, [...v1, 'l1']), ...v1.map((id, index) => render(id, 1, index + 1)), layout('l1', 'timeline.create', v1),
    record({ id: 'q2', operation: 'plan.update', params: { plan: 'p1' }, report: { plan: 'p1', version: 2 } }),
    approve('a2', 2, ['s3', 's7', 'l2']), render('s3', 2, 3), render('s7', 2, 7), layout('l2', 'timeline.update', ['r1', 'r2', 's3', 'r4', 'r5', 'r6', 's7']),
    render('x7', 2, 7, 's7'),
    record({ id: 'q3', operation: 'plan.update', params: { plan: 'p1' }, report: { plan: 'p1', version: 3 } }),
    approve('a3', 3, ['w5', 'l3']), render('w5', 3, 5), layout('l3', 'timeline.update', ['r1', 'r2', 's3', 'r4', 'w5', 'r6', 's7']),
    record({ id: 'k1', operation: 'timeline.clip_replace', params: { timeline: 't1', clip: 'cl3' }, inputs: [{ role: 'clip', ref: { asset: 'r3.mp4' }, resolved_asset: 'r3.mp4' }] }),
    record({ id: 'q4', operation: 'plan.update', params: { plan: 'p1' }, report: { plan: 'p1', version: 4 } }),
    approve('a4', 4, ['l4']), layout('l4', 'timeline.update', v1),
  ]
  const kept = until === undefined ? all : all.slice(0, all.findIndex(entry => entry.id === until) + 1)
  const ids = new Set(kept.map(entry => entry.id))
  const shots = (count: number, changed: Record<number, string> = {}): PlanVersion['shots'] =>
    Array.from({ length: count }, (_, index) => ({ prompt: changed[index + 1] ?? PROMPTS[index] ?? 'end', modality: 'video' as const, task: 'ref2v' as const, provider: 'fastvideo', model: 'fasth3' }))
  const versions: PlanVersion[] = [
    { version: 1, shots: shots(6), created_by: 'q1' as RecordId },
    { version: 2, shots: shots(7, { 3: 'door, closer' }), created_by: 'q2' as RecordId },
    { version: 3, shots: shots(7, { 3: 'door, closer', 5: 'roof, wider' }), created_by: 'q3' as RecordId },
    { version: 4, shots: shots(6), created_by: 'q4' as RecordId },
  ].filter(version => ids.has(version.created_by))
  const clips = (kept.findLast(entry => entry.operation?.startsWith('timeline.') === true && entry.id.startsWith('l'))?.inputs ?? [])
    .map((input, index) => ({ id: `cl${String(index + 1)}` as ClipId, asset: input.resolved_asset as AssetId | null, source: null, in_sec: null, out_sec: null }))
  if (ids.has('k1') && !ids.has('l4')) clips[2] = { id: 'cl3' as ClipId, asset: 'r3.mp4' as AssetId, source: null, in_sec: null, out_sec: null }
  const renders = kept.filter(entry => entry.operation === 'shot.render')
  const state = withTestRef(fixtureState())
  state.components.proj = {
    records: kept, stale: {}, superseded: {},
    created_by: Object.fromEntries([['ref.png', 'u1'], ...renders.flatMap(entry => entry.outputs.map(output => [output, entry.id]))]),
  }
  state.components.plan.plans = { ['p1' as PlanId]: versions }
  state.components.timeline.timelines = [{ id: 't1' as TimelineId, name: '', clips }]
  state.assets = [
    asset('ref.png', 'image/png', 'u1'),
    ...renders.flatMap(entry => [asset(`${entry.id}.mp4`, 'video/mp4', entry.id, 1), asset(`${entry.id}.png`, 'image/png', entry.id)]),
  ]
  return state
}

/** Record order of the take IDs of {@link rollbackProject}. */
const RECORD_ORDER = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 's3', 's7', 'x7', 'w5']

/** Sort `[id, …]` entries by {@link RECORD_ORDER}. */
function byRecordOrder(a: string | string[], b: string | string[]): number {
  return RECORD_ORDER.indexOf(Array.isArray(a) ? a[0] ?? '' : a) - RECORD_ORDER.indexOf(Array.isArray(b) ? b[0] ?? '' : b)
}

/**
 * The drawn nodes of a state as `[id, type]` pairs.
 * @param state - the state.
 * @returns the pairs, in node order.
 */
function drawn(state: WireState): string[][] {
  return refGraph(state, undefined, [], 'zh', [APPROVAL], [CLIPS], [planNodeType]).nodes.map(node => [node.id, typeOf(node)])
}

describe('buildCanvasGraph', () => {
  it('draws the reference entries, plans, and takes, and hides reference imports, exports, still grabs, and timeline records', () => {
    const graph = refGraph(withTestRef(fixtureState()), undefined, OPERATIONS, 'zh', [], [CLIPS], [planNodeType])
    expect(graph.nodes.map(node => [node.id, typeOf(node)])).toEqual([
      ['test_ref:hero', 'test_ref'], ['plan:p1', 'plan'], ['g1', 'take'], ['g2', 'take'], ['g3', 'take'],
    ])
    // The plan node is an entry of the node type of plans; without that type the core draws no plan node.
    expect(buildCanvasGraph(fixtureState(), undefined, OPERATIONS).nodes.map(node => node.id)).not.toContain('plan:p1')
    const byId = new Map(graph.nodes.map(node => [node.id, node]))
    expect(byId.get('test_ref:hero')).toMatchObject({ type: 'entry', nodeType: testRef.nodeType, thumb: null, references: ['ref.png'], x: 0 })
    expect(byId.get('g1')).toMatchObject({ thumb: 'shot1-last.png', video: 'shot1.mp4', durationSec: 4 })
    expect(byId.get('g2')?.flags.stale).toBe(true)
    expect(byId.get('g2')?.badges).toEqual(['trim'])
    // The core puts no badge of its own: without a TakesInUse that reports the trim, the trimmed take has none.
    expect(buildCanvasGraph(fixtureState(), undefined, OPERATIONS).nodes.find(node => node.id === 'g2')?.badges).toEqual([])
    expect(byId.get('g3')?.flags).toMatchObject({ rendering: true })
    expect(graph.edges).toEqual([
      { from: 'test_ref:hero', to: 'g1', kind: 'reference' },
      { from: 'test_ref:hero', to: 'g2', kind: 'reference' },
      { from: 'g1', to: 'g2', kind: 'first_frame' },
      { from: 'test_ref:hero', to: 'g3', kind: 'reference' },
      { from: 'g1', to: 'g3', kind: 'take' },
    ])
    expect(byId.get('g2')?.x).toBeGreaterThan(byId.get('g1')?.x ?? Infinity)
    expect(byId.get('g3')?.x).toBe(byId.get('g1')?.x)
    // The original take and its retake are numbered; a shot with one take has no number.
    expect([byId.get('g1')?.take, byId.get('g3')?.take, byId.get('g2')?.take]).toEqual([1, 2, null])
    // Reference images map to their item; derived assets map up the producer chain to a drawn take.
    expect(graph.assetNodes).toMatchObject({ 'ref.png': 'test_ref:hero', 'shot1.mp4': 'g1', 'export.mp4': 'g2' })
  })

  it('draws an imported asset only while it is on the canvas list, and never a reference image of an item', () => {
    const state = withTestRef(fixtureState())
    const proj = state.components.proj
    const names = ['pool.png', 'used.png', 'listed.png', 'side.png']
    state.assets.push(...names.map((name, index) => asset(name, 'image/png', `u${String(index + 2)}`)))
    proj.records.push(...names.map((name, index) => record({ id: `u${String(index + 2)}`, operation: 'asset.import', params: { name }, outputs: [name] })))
    names.forEach((name, index) => { proj.created_by[name] = `u${String(index + 2)}` })
    // A second reference image of Hero, written by an update of its item, is part of Hero's node.
    proj.records.push(record({
      id: 'e2', operation: 'test_ref.update', params: { test_ref: 'hero' },
      inputs: [{ role: 'reference', ref: { asset: 'side.png' }, resolved_asset: 'side.png' }],
    }))
    state.components.test_ref?.['hero']?.push({ id: 'hero', version: 2, name: 'Hero', description: '', references: ['ref.png', 'side.png'], created_by: 'e2' })
    // A take reads used.png, which is off the list: no node and no edge for it.
    proj.records.push(record({
      id: 'g9', operation: 'shot.render', deterministic: false, params: { prompt: 'alone' },
      inputs: [{ role: 'reference', ref: { asset: 'used.png' }, resolved_asset: 'used.png' }],
    }))
    const graph = refGraph(state, new Set(['listed.png', 'side.png', 'ref.png']), OPERATIONS)
    expect(graph.nodes.filter(node => node.type === 'asset').map(node => node.id)).toEqual(['u4'])
    expect(graph.nodes.find(node => node.id === 'test_ref:hero')?.references).toEqual(['ref.png', 'side.png'])
    expect(graph.edges.filter(edge => edge.to === 'g9')).toEqual([])
    expect(graph.assetNodes).toMatchObject({ 'listed.png': 'u4', 'side.png': 'test_ref:hero' })
    expect([graph.assetNodes['pool.png'], graph.assetNodes['used.png']]).toEqual([undefined, undefined])
    // On the list, used.png is drawn with an edge to the take that reads it.
    const listed = buildCanvasGraph(state, new Set(['listed.png', 'used.png']), OPERATIONS)
    expect(listed.edges).toContainEqual({ from: 'u3', to: 'g9', kind: 'reference' })
  })

  it('gives an earlier version\'s assets to the node of its item, and links a version input from that node, through the version kinds', () => {
    const state = withTestRef(fixtureState())
    state.assets.push(asset('side.png', 'image/png', null))
    // Version 2 of Hero replaced ref.png with side.png; ref.png stays on the canvas.
    state.components.test_ref?.['hero']?.push({ id: 'hero', version: 2, name: 'Hero', description: '', references: ['side.png'], created_by: 'e2' })
    const placed = new Set(['ref.png'])
    const graph = refGraph(state, placed, OPERATIONS)
    expect(graph.nodes.filter(node => node.type === 'asset')).toEqual([])
    expect(graph.assetNodes['ref.png']).toBe('test_ref:hero')
    expect(graph.edges).toContainEqual({ from: 'test_ref:hero', to: 'g1', kind: 'reference' })
    // With the node type alone, the import of ref.png is an asset node, and g1 reads hero@1 from it.
    const entriesOnly = buildCanvasGraph(state, placed, OPERATIONS, 'zh', [], [], [testRef.nodeType])
    expect(entriesOnly.nodes.filter(node => node.type === 'asset').map(node => node.id)).toEqual(['u1'])
    expect(entriesOnly.edges).toContainEqual({ from: 'u1', to: 'g1', kind: 'reference' })
  })

  it('draws a placed asset that no record of the current state imported as asset:<id>, and no second node for a take output', () => {
    const state = fixtureState()
    // An undo went back past the import of undone.png: the asset pool keeps it, the current state has no import record.
    state.assets.push(asset('undone.png', 'image/png', 'u9', null, 'asset.import'))
    const graph = buildCanvasGraph(state, new Set(['undone.png', 'shot1-last.png', 'export-last.png']))
    const node = graph.nodes.find(candidate => candidate.id === 'asset:undone.png')
    expect(node).toMatchObject({ type: 'asset', title: 'undone.png', thumb: 'undone.png', video: null, record: null })
    // The take g1 already shows its still; the grabbed still of the export has no other node, so it gets one.
    expect(graph.nodes.filter(candidate => candidate.type === 'asset').map(candidate => candidate.id).sort())
      .toEqual(['asset:export-last.png', 'asset:undone.png'])
    expect(graph.assetNodes['undone.png']).toBe('asset:undone.png')
  })

  it('draws one node for an asset imported twice', () => {
    const state = fixtureState()
    state.assets.push(asset('twice.png', 'image/png', 'u2'))
    state.components.proj.records.push(
      record({ id: 'u2', operation: 'asset.import', params: { name: 'twice.png' }, outputs: ['twice.png'] }),
      record({ id: 'u3', operation: 'asset.import', params: { name: 'twice.png' }, outputs: ['twice.png'] }),
    )
    state.components.proj.created_by['twice.png'] = 'u3'
    const graph = buildCanvasGraph(state, new Set(['twice.png']))
    expect(graph.nodes.filter(node => node.type === 'asset').map(node => node.id)).toEqual(['u2'])
    expect(graph.assetNodes['twice.png']).toBe('u2')
  })

  it('wraps a long shot list into a block of columns without overlapping cards', () => {
    const full = fixtureState()
    const records = full.components.proj.records
    const g2 = records.find(record => record.id === 'g2')
    if (g2 === undefined) throw new Error('fixture lacks g2')
    const shots = Array.from({ length: 22 }, (_, index) => ({ ...g2, id: `s${String(index)}`, inputs: [], params: { prompt: 'p', shot: index + 1 }, outputs: [] }))
    full.components.proj.records = [...records.filter(record => record.operation !== 'shot.render'), ...shots]
    const graph = buildCanvasGraph(full, undefined, OPERATIONS)
    const takes = graph.nodes.filter(node => node.type === 'take')
    expect(new Set(takes.map(node => `${String(node.x)},${String(node.y)}`)).size).toBe(22)
    const width = Math.max(...takes.map(node => node.x)) - Math.min(...takes.map(node => node.x))
    const height = Math.max(...takes.map(node => node.y))
    expect(width).toBeGreaterThan(0)
    expect(height).toBeLessThan(width * 2)
  })

  it('shows the latest plan version and the current take of each of its shots, not every take ever rendered', () => {
    const graph = refGraph(rollbackProject(), undefined, [], 'zh', [APPROVAL], [CLIPS], [planNodeType])
    // v4 has 6 shots and its approval reused every v1 take: no shot 7, no v2 or v3 take, no retake of the removed shot.
    expect(graph.nodes.map(node => [node.id, typeOf(node)])).toEqual([
      ['test_ref:hero', 'test_ref'], ['plan:p1', 'plan'], ...['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map(id => [id, 'take']),
    ])
    const plan = graph.nodes.find(node => node.id === 'plan:p1')
    expect([plan?.type === 'entry' ? plan.entry.slots : undefined, plan?.record?.id]).toEqual([6, 'q4'])
    expect(graph.nodes.filter(node => node.type === 'take').map(node => [node.title, node.take]))
      .toEqual(['1', '2', '3', '4', '5', '6'].map(shot => [shot, null]))
    expect(graph.edges.filter(edge => edge.kind === 'chain').map(edge => [edge.from, edge.to])).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map(id => ['plan:p1', id]))
    // Assets of takes the canvas leaves out have no node, so dropping one on the canvas finds none.
    expect(graph.assetNodes['s7.mp4']).toBeUndefined()
    expect(graph.assetNodes['r3.mp4']).toBe('r3')
  })

  it('a jump back to an earlier step changes the canvas to that step\'s plan version and takes', () => {
    // Back to just after the v3 approval: plan v3 with 7 shots, the takes its timeline plays.
    expect(drawn(rollbackProject('l3'))).toEqual([
      ['test_ref:hero', 'test_ref'], ['plan:p1', 'plan'], ...['r1', 'r2', 's3', 'r4', 's7', 'x7', 'w5', 'r6'].map(id => [id, 'take']).sort(byRecordOrder),
    ])
    // Back to just after the v1 approval: v1 and its 6 takes only.
    expect(drawn(rollbackProject('l1'))).toEqual([
      ['test_ref:hero', 'test_ref'], ['plan:p1', 'plan'], ...['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map(id => [id, 'take']),
    ])
    // Back to before the plan: the character and its reference only.
    expect(drawn(rollbackProject('e1'))).toEqual([['test_ref:hero', 'test_ref']])
  })

  it('a take a timeline clip plays is the current take of its shot, and an unapproved latest version keeps the played takes', () => {
    // After the agent put the v1 take of shot 3 back (k1), the v3 timeline plays r3 instead of s3.
    const replaced = drawn(rollbackProject('k1')).map(([id]) => id)
    expect(replaced).toContain('r3')
    expect(replaced).not.toContain('s3')
    // v4 written but not approved yet: the timeline still plays the v3 takes, so they stay with the retake x7 of the played
    // s7; v4 has no takes of its own.
    const pending = rollbackProject('q4')
    expect(pending.components.proj.records.some(entry => entry.id === 'a4')).toBe(false)
    expect(drawn(pending).filter(([, type]) => type === 'take').map(([id]) => id)).toEqual(['r1', 'r2', 'r3', 'r4', 's7', 'x7', 'w5', 'r6'].sort(byRecordOrder))
  })

  it('draws each generation record as a take, titled by its operation label without an anchored chain; off the wire its own facts decide', () => {
    const generation = (name: string, type: string, label: WireOperation['label']): WireOperation => ({
      name, version: '1', description: name, inputs: {}, params: {}, outputs: [{ role: type, type }], deterministic: false, resource: 'gpu', confirm: 'never',
      ...label === undefined ? {} : { label },
    })
    // A timeline export is not deterministic and outputs a video, but it runs on the CPU.
    const exported: WireOperation = { ...generation('timeline.export', 'video', undefined), resource: 'cpu' }
    const operations = [...OPERATIONS, generation('image.generate', 'image', { zh: '生成图像', en: 'Generate image' }), generation('audio.generate', 'audio', undefined), exported]
    const state = fixtureState()
    const proj = state.components.proj
    proj.records.push(
      record({ id: 'i1', operation: 'image.generate', deterministic: false, params: { prompt: 'a cat' }, outputs: ['cat.png'] }),
      record({ id: 'i2', operation: 'image.generate', deterministic: false, based_on: 'i1', started_by: { record: 'w1', slot: 2 }, outputs: ['cat2.png'] }),
      record({ id: 'v1', operation: 'audio.generate', deterministic: false, outputs: ['line.wav'] }),
      record({ id: 'c9', operation: 'timeline.export', deterministic: false, outputs: ['cut.mp4'] }),
    )
    state.assets.push(asset('cat.png', 'image/png', 'i1'), asset('cat2.png', 'image/png', 'i2'), asset('line.wav', 'audio/wav', 'v1', 2), asset('cut.mp4', 'video/mp4', 'c9', 3))
    Object.assign(proj.created_by, { 'cat.png': 'i1', 'cat2.png': 'i2', 'line.wav': 'v1', 'cut.mp4': 'c9' })
    const graph = buildCanvasGraph(state, new Set(['cat.png']), operations, 'en')
    const byId = new Map(graph.nodes.map(node => [node.id, node]))
    expect(byId.get('i1')).toMatchObject({ type: 'take', title: '', label: 'Generate image', subtitle: 'a cat', thumb: 'cat.png', video: null, take: 1 })
    // The starter w1 of i2's chain is not loaded, so the chain has no anchor and i2 is a free take.
    expect(byId.get('i2')).toMatchObject({ type: 'take', title: '', label: 'Generate image', thumb: 'cat2.png', take: 2 })
    expect(byId.get('i2')?.chain).toBeUndefined()
    expect(byId.get('v1')).toMatchObject({ type: 'take', title: '', label: 'audio.generate', thumb: null, video: 'line.wav', durationSec: 2 })
    expect(graph.edges).toContainEqual({ from: 'i1', to: 'i2', kind: 'take' })
    // The CPU export is no take; a render take reads its operation label by the same rule; the placed take output gets no node.
    expect(byId.has('c9')).toBe(false)
    expect(byId.get('g1')).toMatchObject({ type: 'take', title: '', label: 'shot.render', take: 1 })
    expect(graph.nodes.filter(node => node.type === 'asset')).toEqual([])
    expect(graph.assetNodes).toMatchObject({ 'cat.png': 'i1', 'line.wav': 'v1' })
    // Without the declarations, a record that is not deterministic and output media is a take, so the old export is one;
    // the running retake g3 has no output yet and is none.
    const offWire = buildCanvasGraph(state).nodes.map(node => node.id)
    expect(offWire).toEqual(expect.arrayContaining(['g1', 'g2', 'i1', 'i2', 'v1', 'c9']))
    expect(offWire).not.toContain('g3')
  })
})

describe('chain grouping', () => {
  /**
   * The shared fixture plus the chains of two workflows on plan p1: the story approval st0 started n1 (slot 2), and the
   * later story approval st1 started h1 (slot 1), which the canvas retake h2 is based on; the ad approval ad1 started a
   * 9:16 take v9 and a 16:9 take v16 of slot 1. The starter zz1 of o1 is not loaded. Each take outputs one image.
   * @returns the state.
   */
  function chainState(): WireState {
    const state = fixtureState()
    const take = (id: string, startedBy: ProjectRecord['started_by'], basedOn: string | null = null): ProjectRecord => record({
      id, operation: 'shot.render', deterministic: false, based_on: basedOn, outputs: [`${id}.png`],
      ...startedBy === undefined ? {} : { started_by: startedBy },
    })
    state.components.proj.records.push(
      record({ id: 'st0', operation: 'story.approve', params: { plan: 'p1' } }), take('n1', { record: 'st0', slot: 2 }),
      record({ id: 'st1', operation: 'story.approve', params: { plan: 'p1' } }), take('h1', { record: 'st1', slot: 1 }), take('h2', undefined, 'h1'),
      record({ id: 'ad1', operation: 'ad.approve', params: { plan: 'p1' } }),
      take('v9', { record: 'ad1', slot: 1, lane: '9:16' }), take('v16', { record: 'ad1', slot: 1, lane: '16:9' }),
      take('o1', { record: 'zz1', slot: 2 }),
    )
    for (const id of ['n1', 'h1', 'h2', 'v9', 'v16', 'o1']) {
      state.assets.push(asset(`${id}.png`, 'image/png', id))
      state.components.proj.created_by[`${id}.png`] = id
    }
    return state
  }
  const ANCHORS = [anchorOf('story.approve'), anchorOf('ad.approve')]

  it('draws the chain of the newest starter of each operation on a node, every free take, and the records a TakesInUse uses', () => {
    const takes = (inUse: TakesInUse[] = []): string[] => buildCanvasGraph(chainState(), undefined, OPERATIONS, 'zh', ANCHORS, inUse)
      .nodes.filter(node => node.type === 'take').map(node => node.id)
    // st1 replaced st0 on plan:p1, so n1 is left out; the story chain and the ad chain both show; o1, g1, g2 and g3 are free takes.
    expect(takes()).toEqual(['g1', 'g2', 'g3', 'h1', 'h2', 'v9', 'v16', 'o1'])
    expect(takes([{ id: 'test-uses', uses: () => ['n1'] }])).toEqual(['g1', 'g2', 'g3', 'n1', 'h1', 'h2', 'v9', 'v16', 'o1'])
    // Without anchors no chain is anchored, so n1 is a free take as well.
    expect(buildCanvasGraph(chainState(), undefined, OPERATIONS).nodes.some(node => node.id === 'n1')).toBe(true)
  })

  it('titles a take by the slot and lane of its anchored chain, numbers takes by anchor, slot and lane, and fills slot frames', () => {
    const graph = buildCanvasGraph(chainState(), undefined, OPERATIONS, 'en', ANCHORS, [], [planNodeType])
    const byId = new Map(graph.nodes.map(node => [node.id, node]))
    // The retake h2 has no started_by and keeps the slot of its root h1; two lanes of one slot are two groups.
    expect(['h1', 'h2', 'v9', 'v16', 'o1'].map(id => [byId.get(id)?.title, byId.get(id)?.take])).toEqual([
      ['1', 1], ['1', 2], ['1 · 9:16', null], ['1 · 16:9', null], ['', null],
    ])
    expect(byId.get('o1')).toMatchObject({ label: 'shot.render' })
    expect(graph.edges.filter(edge => edge.kind === 'chain').map(edge => [edge.from, edge.to]))
      .toEqual(['h1', 'h2', 'v9', 'v16'].map(id => ['plan:p1', id]))
    // Slot 1 shows the newest finished take of an anchored chain on plan:p1 with slot 1; slot 2 has none, since o1 is free.
    expect(slotFrames(graph.nodes, 'plan:p1', 2)).toEqual([{ thumb: 'v16.png', video: null }, null])
  })

  it('lays out six takes in two lanes by anchor, slot (null last), lane in first-record order, then record order', () => {
    const state = fixtureState()
    // The ad approval ad1 writes its 9:16 lane first; each lane writes slot null, then 2, then 1.
    const take = (id: string, slot: number | null, lane: string): ProjectRecord =>
      record({ id, operation: 'shot.render', deterministic: false, started_by: { record: 'ad1', slot, lane } })
    state.components.proj.records.push(
      record({ id: 'ad1', operation: 'ad.approve', params: { plan: 'p1' } }),
      take('m0', null, '9:16'), take('m2', 2, '9:16'), take('m1', 1, '9:16'),
      take('w2', 2, '16:9'), take('w0', null, '16:9'), take('w1', 1, '16:9'),
    )
    const graph = buildCanvasGraph(state, undefined, OPERATIONS, 'zh', [anchorOf('ad.approve')])
    // Column 2 top to bottom, then its next sub-column: the free take g1 and its retake g3 come first, as the first records.
    const placed = graph.nodes.filter(node => ['g1', 'g3', 'm0', 'm1', 'm2', 'w0', 'w1', 'w2'].includes(node.id))
      .sort((a, b) => a.x - b.x || a.y - b.y).map(node => node.id)
    expect(placed).toEqual(['g1', 'g3', 'm1', 'w1', 'm2', 'w2', 'm0', 'w0'])
    // The nodes keep record order, so take numbers and slot frames read it.
    expect(graph.nodes.filter(node => node.type === 'take').map(node => node.id)).toEqual(['g1', 'g2', 'g3', 'm0', 'm2', 'm1', 'w2', 'w0', 'w1'])
  })
})

describe('node types', () => {
  it('draws each entry of a registered NodeType in its column, and a take that reads an entry\'s media links from the entry', () => {
    const state = fixtureState()
    const reads = (asset: string): ProjectRecord['inputs'] => [{ role: 'reference', ref: { asset }, resolved_asset: asset }]
    const m1 = record({ id: 'm1', operation: 'prop.create', inputs: reads('ref.png') })
    state.components.proj.records.push(
      record({ id: 'u2', operation: 'asset.import', params: { name: 'umbrella.png' }, outputs: ['umbrella.png'] }), m1,
      record({ id: 'g4', operation: 'shot.render', deterministic: false, inputs: reads('umbrella.png'), outputs: ['g4.png'] }),
    )
    state.assets.push(asset('umbrella.png', 'image/png', 'u2'), asset('g4.png', 'image/png', 'g4'))
    Object.assign(state.components.proj.created_by, { 'umbrella.png': 'u2', 'g4.png': 'g4' })
    const type: NodeType = {
      id: '@dv/ui-prop', type: 'prop', label: () => '道具', color: '#888', column: 1,
      entries: () => [{ id: 'prop:m1', record: m1, title: 'Red umbrella', media: ['umbrella.png'] }],
    }
    const placed = new Set(['umbrella.png'])
    // Without the type, the import of the placed umbrella image is an asset node.
    expect(buildCanvasGraph(state, placed, OPERATIONS).nodes.some(node => node.id === 'u2')).toBe(true)
    const graph = buildCanvasGraph(state, placed, OPERATIONS, 'zh', [], [], [type, planNodeType])
    const byId = new Map(graph.nodes.map(node => [node.id, node]))
    expect(byId.get('prop:m1')).toMatchObject({ type: 'entry', nodeType: type, title: 'Red umbrella', subtitle: '', references: ['umbrella.png'], record: m1 })
    expect(byId.has('u2')).toBe(false)
    expect(graph.assetNodes['umbrella.png']).toBe('prop:m1')
    expect(graph.edges).toContainEqual({ from: 'prop:m1', to: 'g4', kind: 'reference' })
    // The entry's own record draws no input edge (m1 read the hero's reference image), and column 1 holds plan:p1 too.
    expect(graph.edges.some(edge => edge.to === 'prop:m1')).toBe(false)
    expect(byId.get('prop:m1')?.x).toBe(byId.get('plan:p1')?.x)
  })
})

describe('T1c: the canvas writes a reference of any kind', () => {
  /**
   * The shared fixture plus a take `g9` that reads version 3 of `z1`, an item of a reference kind `zz` that no UI package
   * knows, whose reference image `zz.png` the import `u9` wrote.
   * @returns the state.
   */
  function unknownKindState(): WireState {
    const state = withTestRef(fixtureState())
    state.assets.push(asset('zz.png', 'image/png', 'u9'))
    state.components.proj.created_by['zz.png'] = 'u9'
    state.components.proj.records.push(
      record({ id: 'u9', operation: 'asset.import', params: { name: 'zz.png' }, outputs: ['zz.png'] }),
      record({
        id: 'g9', operation: 'shot.render', deterministic: false, params: { prompt: 'z1 waits' },
        inputs: [{ role: 'reference', ref: { zz: 'z1', version: 3 }, resolved_asset: 'zz.png' }],
      }),
    )
    return state
  }

  it('T1c.1: a take input { zz: z1, version: 3 } reads as the reference chip z1@3, never undefined@', () => {
    const take = buildCanvasGraph(unknownKindState(), undefined, OPERATIONS).nodes.find(node => node.id === 'g9')
    // The take editor's chips and the retry request write each input with formatInputRef.
    const chips = take?.record?.inputs.map(input => formatInputRef(input.ref))
    expect(chips).toEqual(['z1@3'])
    expect(chips?.join(' ')).not.toContain('undefined')
  })

  it('T1c.2: a version of a kind without a version kind links from the node of its asset; a test_ref version links from its entry node', () => {
    const graph = refGraph(unknownKindState(), new Set(['zz.png']), OPERATIONS)
    expect(graph.edges).toContainEqual({ from: 'u9', to: 'g9', kind: 'reference' })
    expect(graph.edges).toContainEqual({ from: 'test_ref:hero', to: 'g1', kind: 'reference' })
  })
})

describe('freePositions', () => {
  it('moves a node whose automatic spot is taken down a row at a time, and leaves stored nodes alone', () => {
    const [template] = buildCanvasGraph(fixtureState()).nodes
    if (template === undefined) throw new Error('fixture has no nodes')
    const at = (id: string, x: number, y: number) => ({ ...template, id, x, y })
    // `moved` is stored half a card to the right of `a`'s automatic spot; `b`'s automatic spot is where `a` moves to.
    const nodes = [at('moved', 0, 0), at('a', 0, 0), at('b', 0, ROW)]
    const placed = freePositions(nodes, { moved: { x: NODE_WIDTH / 2, y: 0 } }, () => 150)
    expect(placed).toEqual({ a: { x: 0, y: ROW }, b: { x: 0, y: 2 * ROW } })
  })
})
