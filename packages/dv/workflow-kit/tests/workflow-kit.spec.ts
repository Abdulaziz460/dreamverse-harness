/**
 * The shot walk: render params in `walkShot`, take reuse in `planShots`, refusals in `checkShots`, preview lines in
 * `shotLine`, the render chain of `scheduleShots`, and the chain rule of `chainOf`, `chainStarter`, `takeFilter` and
 * `keepTimeline`.
 */
import type { GenerationApi, GenerationCall } from '@dv/generation'
import type { AssetId, ProjectId, ProjectRecord, ProjectState, RecordId, RunRequest } from '@dv/project'
import type { ResolvedShot, Shot } from '@dv/shot-plan'
import type { TimelineId } from '@dv/timeline'
import { describe, expect, it } from 'vitest'
import {
  chainOf, chainStarter, checkShots, keepTimeline, planShots, scheduleShots, shotLine, takeFilter, walkShot, type Owns, type WalkStep,
} from '../src/index.ts'

/** A record ID from its text. */
const rid = (text: string): RecordId => text as RecordId

/** A done render record with the given ID, params, inputs and other fields. */
function take(id: string, params: Record<string, unknown>, inputs: RunRequest['inputs'] = [], fields: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: rid(id), parents: [], kind: 'operation', component: 'shot', operation: 'shot.render', operation_version: '1',
    actor: 'system', surface: 'chat', turn: null, session: null, tool_call: null, intent: 'x', params,
    inputs: inputs.map(input => ({ ...input, resolved_asset: null })), outputs: [], based_on: null, supersedes: [],
    deterministic: false, status: 'done', created_at: '2026-10-17T00:00:00.000Z', ...fields,
  }
}

/** An approval record of a plan, the starter of a chain. */
function approval(id: string, plan: string): ProjectRecord {
  return take(id, { plan }, [], { component: 'test_flow', operation: 'test_flow.approve' })
}

/** A project state whose history holds the given records, oldest first. */
function stateOf(records: ProjectRecord[]): ProjectState {
  const components = { proj: { records, stale: {}, superseded: {}, created_by: {} } } as ProjectState['components']
  return { project: { id: 'proj' as ProjectId, title: 't', created_at: '' }, head: rid('head'), components }
}

/** A reference input of an asset. */
function reference(asset: string): RunRequest['inputs'][number] {
  return { role: 'reference', ref: { asset: asset as AssetId } }
}

/** A first_frame input of a take's last still. */
function firstFrame(record: string): RunRequest['inputs'][number] {
  return { role: 'first_frame', ref: { record: rid(record), output: 1 } }
}

/** One `check` call of the fake generation service, with its chained roles. */
interface CheckCall { call: Pick<GenerationCall, 'project' | 'params' | 'inputs'>; chained: readonly string[] }

/** The first frame citation of a prompt, which needs a `first_frame` input or a chained `first_frame` role. */
const CITES_FIRST_FRAME = 'dv:input/first_frame'

/**
 * A generation service that records its render and check calls and answers `n1`, `n2`, … for renders. `findTake`
 * returns the newest done record that `where` accepts with equal params and inputs; references parse to assets; `check`
 * refuses a prompt that cites the first frame without a `first_frame` input or chained role, and a prompt `bad`.
 */
function fakeRenderer(renders: GenerationCall[] = [], checks: CheckCall[] = []): Pick<GenerationApi, 'render' | 'findTake' | 'parseInputs' | 'check'> {
  return {
    render: (call) => {
      renders.push(call)
      return Promise.resolve(rid(`n${String(renders.length)}`))
    },
    findTake: (state, call, where) => state.components.proj.records.findLast(record => record.status === 'done' && where(record)
      && JSON.stringify(record.params) === JSON.stringify(call.params)
      && JSON.stringify(record.inputs.map(({ role, ref }) => ({ role, ref }))) === JSON.stringify(call.inputs))?.id ?? null,
    parseInputs: raw => [raw['reference'] ?? []].flat().map(reference),
    check: (call, _state, chained = []) => {
      checks.push({ call, chained })
      const prompt = String(call.params['prompt'])
      const hasFirstFrame = chained.includes('first_frame') || call.inputs.some(input => input.role === 'first_frame')
      if (prompt.includes(CITES_FIRST_FRAME) && !hasFirstFrame) return Promise.resolve(['The prompt cites a first frame the call does not have.'])
      return Promise.resolve(prompt === 'bad' ? ['Bad prompt.'] : [])
    },
  }
}

/** A filter that accepts every record. */
const anyRecord = (): boolean => true

/** A video shot of the test model with the given prompt and fields. */
function shotOf(prompt: string, fields: Partial<Shot> = {}): Shot {
  return { modality: 'video', task: 'ref2v', provider: 'test', model: 'm1', prompt, ...fields }
}

describe('walkShot', () => {
  it('maps a resolved shot to its model key, prompt and plan values, and the overrides win', () => {
    const resolved: ResolvedShot = {
      slot: 2, shot: shotOf('a', { duration_sec: 3 }), aspect_ratio: '16:9', seed: 7, references: ['c1@1'], continuePrevious: true,
    }
    const key = { modality: 'video', task: 'ref2v', provider: 'test', model: 'm1' }
    expect(walkShot(resolved)).toEqual({
      slot: 2, params: { ...key, prompt: 'a', duration_sec: 3, aspect_ratio: '16:9', seed: 7 }, references: ['c1@1'], continuePrevious: true,
    })
    expect(walkShot(resolved, { aspect_ratio: '9:16' }).params).toEqual({ ...key, prompt: 'a', duration_sec: 3, aspect_ratio: '9:16', seed: 7 })
    expect(Object.keys(walkShot({ slot: 1, shot: shotOf('b'), references: [], continuePrevious: false }).params))
      .toEqual(['modality', 'task', 'provider', 'model', 'prompt'])
  })
})

describe('planShots', () => {
  it('reuses equal takes, and starts a continuing shot from the reused take of the shot before it', () => {
    const state = stateOf([
      take('t1', { prompt: 'a' }, [reference('img')]),
      take('t2', { prompt: 'b' }, [firstFrame('t1')]),
      take('t4', { prompt: 'd' }),
      take('t5', { prompt: 'e' }),
    ])
    const steps = planShots(fakeRenderer(), state, [
      { slot: 1, params: { prompt: 'a' }, references: ['img'], continuePrevious: false },
      { slot: 2, params: { prompt: 'b' }, references: [], continuePrevious: true },
      { slot: 3, params: { prompt: 'c' }, references: [], continuePrevious: false },
      // After a rendered shot, a continuing shot never reuses, though t4 equals it without a first frame.
      { slot: 4, params: { prompt: 'd' }, references: [], continuePrevious: true },
    ], anyRecord)
    expect(steps).toEqual([
      { slot: 1, params: { prompt: 'a' }, inputs: [reference('img')], continuePrevious: false, reuse: rid('t1') },
      { slot: 2, params: { prompt: 'b' }, inputs: [], continuePrevious: true, reuse: rid('t2') },
      { slot: 3, params: { prompt: 'c' }, inputs: [], continuePrevious: false, reuse: null },
      { slot: 4, params: { prompt: 'd' }, inputs: [], continuePrevious: true, reuse: null },
    ])
    // A continuing first shot has no previous take, so it matches plainly.
    const first = planShots(fakeRenderer(), state, [{ slot: 1, params: { prompt: 'e' }, references: [], continuePrevious: true }], anyRecord)
    expect(first[0]?.reuse).toBe(rid('t5'))
  })

  it('reuses only the takes that `where` accepts', () => {
    const state = stateOf([take('started', { prompt: 'a' }, [], { started_by: { record: rid('a1'), slot: 1 } }), take('free', { prompt: 'a' })])
    const shots = [{ slot: 1, params: { prompt: 'a' }, references: [], continuePrevious: false }]
    expect(planShots(fakeRenderer(), state, shots, record => record.started_by !== undefined)[0]?.reuse).toBe(rid('started'))
    expect(planShots(fakeRenderer(), state, shots, () => false)[0]?.reuse).toBeNull()
  })
})

describe('checkShots', () => {
  it('checks each rendered step, a continuing step with the kept take\'s last still or with first_frame chained', async () => {
    const checks: CheckCall[] = []
    const steps: WalkStep[] = [
      { slot: 1, params: { prompt: 'a' }, inputs: [reference('img')], continuePrevious: false, reuse: null },
      // Case (i): shot 2 continues a shot that renders and cites its first frame; the chained role lets it pass.
      { slot: 2, params: { prompt: `b ${CITES_FIRST_FRAME}` }, inputs: [], continuePrevious: true, reuse: null },
      { slot: 3, params: { prompt: 'c' }, inputs: [], continuePrevious: false, reuse: rid('t3') },
      { slot: 4, params: { prompt: `d ${CITES_FIRST_FRAME}` }, inputs: [], continuePrevious: true, reuse: null },
      { slot: 5, params: { prompt: 'bad' }, inputs: [], continuePrevious: false, reuse: null },
      { slot: 6, params: { prompt: `f ${CITES_FIRST_FRAME}` }, inputs: [], continuePrevious: false, reuse: null },
    ]
    const state = stateOf([])
    expect(await checkShots(fakeRenderer([], checks), state, steps)).toEqual([
      { slot: 5, reason: 'Bad prompt.' },
      { slot: 6, reason: 'The prompt cites a first frame the call does not have.' },
    ])
    expect(checks.map(({ call, chained }) => ({ project: call.project, prompt: call.params['prompt'], inputs: call.inputs, chained }))).toEqual([
      { project: 'proj', prompt: 'a', inputs: [reference('img')], chained: [] },
      { project: 'proj', prompt: `b ${CITES_FIRST_FRAME}`, inputs: [], chained: ['first_frame'] },
      { project: 'proj', prompt: `d ${CITES_FIRST_FRAME}`, inputs: [firstFrame('t3')], chained: [] },
      { project: 'proj', prompt: 'bad', inputs: [], chained: [] },
      { project: 'proj', prompt: `f ${CITES_FIRST_FRAME}`, inputs: [], chained: [] },
    ])
    // A check call carries no origin: only the project, the params and the inputs, which is all that check reads.
    for (const { call } of checks) expect(Object.keys(call)).toEqual(['project', 'params', 'inputs'])
  })
})

describe('shotLine', () => {
  it('writes the model key, duration, continuation and prompt start of a rendered step, and keeps a reused take', () => {
    const step: WalkStep = { slot: 2, params: {}, inputs: [], continuePrevious: true, reuse: null }
    expect(shotLine(step, shotOf('a', { duration_sec: 3 }))).toBe('shot 2 (video/ref2v/test/m1, 3 s, continues from the previous shot): a')
    expect(shotLine({ ...step, continuePrevious: false }, shotOf('x'.repeat(81)))).toBe(`shot 2 (video/ref2v/test/m1): ${'x'.repeat(80)}…`)
    expect(shotLine({ ...step, reuse: rid('t2') }, shotOf('a'))).toBe('shot 2: keeps its take')
  })
})

describe('scheduleShots', () => {
  const origin = { actor: 'system', surface: 'chat', session: null, turn: null, tool_call: null } as const
  const call = { ...origin, project: 'proj' as ProjectId, approve: rid('a1'), intent: (slot: number) => `shot ${String(slot)} of plan p1 v1` }

  it('renders each step that reuses nothing after the previous render, from the previous take when continuing', async () => {
    const renders: GenerationCall[] = []
    const steps: WalkStep[] = [
      { slot: 1, params: { prompt: 'a' }, inputs: [reference('img')], continuePrevious: false, reuse: null },
      { slot: 2, params: { prompt: 'b' }, inputs: [], continuePrevious: false, reuse: rid('t1') },
      { slot: 3, params: { prompt: 'c' }, inputs: [], continuePrevious: true, reuse: null },
      { slot: 4, params: { prompt: 'd' }, inputs: [reference('img')], continuePrevious: true, reuse: null },
    ]
    const result = await scheduleShots(fakeRenderer(renders), steps, call)
    expect(result).toEqual({ takes: [rid('n1'), rid('t1'), rid('n2'), rid('n3')], scheduled: [rid('n1'), rid('n2'), rid('n3')] })
    const base = { ...origin, project: 'proj' }
    expect(renders).toStrictEqual([
      { ...base, intent: 'shot 1 of plan p1 v1', params: { prompt: 'a' }, inputs: [reference('img')], after: [], started_by: { record: 'a1', slot: 1 } },
      { ...base, intent: 'shot 3 of plan p1 v1', params: { prompt: 'c' }, inputs: [firstFrame('t1')], after: ['n1'], started_by: { record: 'a1', slot: 3 } },
      {
        ...base, intent: 'shot 4 of plan p1 v1', params: { prompt: 'd' }, inputs: [reference('img'), firstFrame('n2')], after: ['n2'],
        started_by: { record: 'a1', slot: 4 },
      },
    ])
    expect(steps[3]?.inputs).toEqual([reference('img')])
  })

  it('starts the first render after `call.after` and marks every render with the lane', async () => {
    const renders: GenerationCall[] = []
    const steps: WalkStep[] = [
      { slot: 1, params: { prompt: 'a' }, inputs: [], continuePrevious: false, reuse: null },
      { slot: 2, params: { prompt: 'b' }, inputs: [], continuePrevious: false, reuse: null },
    ]
    await scheduleShots(fakeRenderer(renders), steps, { ...call, lane: '9:16', after: [rid('v1')] })
    expect(renders.map(({ after, started_by: startedBy }) => ({ after, startedBy }))).toEqual([
      { after: ['v1'], startedBy: { record: 'a1', slot: 1, lane: '9:16' } },
      { after: ['n1'], startedBy: { record: 'a1', slot: 2, lane: '9:16' } },
    ])
  })
})

describe('chainOf', () => {
  it('reads the own started_by, else the started_by of the based_on root, else null', () => {
    const chain = { record: rid('a1'), slot: 2 }
    const records = [
      take('t1', {}, [], { started_by: chain }),
      take('retake', {}, [], { based_on: rid('t1') }),
      take('retake2', {}, [], { based_on: rid('retake') }),
      take('own', {}, [], { based_on: rid('t1'), started_by: { record: rid('a2'), slot: 1 } }),
      take('free', {}),
      take('free2', {}, [], { based_on: rid('free') }),
      take('lost', {}, [], { based_on: rid('gone') }),
      take('loop1', {}, [], { based_on: rid('loop2') }),
      take('loop2', {}, [], { based_on: rid('loop1') }),
    ]
    const state = stateOf(records)
    expect(records.map(record => chainOf(state, record))).toEqual([chain, chain, chain, { record: 'a2', slot: 1 }, null, null, null, null, null])
  })
})

describe('chain starters', () => {
  /** The test workflow's rule: an approval of plan p1. */
  const ownsP1: Owns = starter => starter.operation === 'test_flow.approve' && starter.params['plan'] === 'p1'
  const records = [
    approval('a1', 'p1'),
    approval('a2', 'p2'),
    take('t1', { prompt: 'a' }, [], { started_by: { record: rid('a1'), slot: 1 } }),
    take('retake', { prompt: 'a' }, [], { based_on: rid('t1') }),
    take('other', { prompt: 'a' }, [], { started_by: { record: rid('a2'), slot: 1 } }),
    take('orphan', { prompt: 'a' }, [], { started_by: { record: rid('gone'), slot: 1 } }),
    take('free', { prompt: 'a' }),
  ]
  const state = stateOf(records)

  it('finds the starter of a record in the log, and accepts a take only when the caller owns its starter', () => {
    expect(records.map(record => chainStarter(state, record)?.id ?? null)).toEqual([null, null, 'a1', 'a1', 'a2', null, null])
    expect(records.filter(takeFilter(state, ownsP1)).map(record => record.id)).toEqual(['t1', 'retake'])
  })

  it('keeps the linked timeline only while its last write has a starter that the caller owns', () => {
    const t1 = 't1' as TimelineId
    const layout = take('layout', { timeline: 't1' }, [], { operation: 'timeline.update', started_by: { record: rid('a1'), slot: null } })
    const lastWriteOf = (last: ProjectRecord | null): { lastWrite: () => ProjectRecord | null } => ({ lastWrite: () => last })
    expect(keepTimeline(lastWriteOf(layout), state, t1, ownsP1)).toBe(t1)
    expect(keepTimeline(lastWriteOf(layout), state, null, ownsP1)).toBeNull()
    expect(keepTimeline(lastWriteOf(null), state, t1, ownsP1)).toBeNull()
    // The user's own layout has no starter; a layout of another plan's approval is not the caller's.
    const edit = take('edit', { timeline: 't1' }, [], { operation: 'timeline.update', actor: 'user' })
    expect(keepTimeline(lastWriteOf(edit), state, t1, ownsP1)).toBeNull()
    expect(keepTimeline(lastWriteOf({ ...layout, started_by: { record: rid('a2'), slot: null } }), state, t1, ownsP1)).toBeNull()
  })
})
