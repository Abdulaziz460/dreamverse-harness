/**
 * Parity of `story.approve` with `plan.approve` in the REAL composition of `fixture.ts` (test case T4 pass 1). Each case
 * runs the same steps in two projects of one composition: one approves with `plan.approve`, the other with
 * `story.approve`. Each approval records the run requests that its execute sends to `dvProject.run`, and the timelines
 * after its renders finish. The two recordings must be equal after three normalizations: a record ID becomes its
 * position in the project's records (`#<n>`); the params `plan`, `plan_version` and `shot` are dropped, because only
 * `plan.approve` writes them; only the intents of the renders are kept, because the timeline intents differ. The
 * `plan.approve` side of each approval must also equal its entry in `parity.golden.json`, which keeps that side after
 * `plan.approve` is gone.
 */
import { readFileSync } from 'node:fs'
import type { ProjectId, RecordId, RecordInputRef, RunRequest } from '@dv/project'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeAll, REF, start, TXT, USER, type Fixture } from './fixture.ts'

afterEach(disposeAll)

/** The normalized `plan.approve` side of each approval of the cases, by approval name. */
const GOLDEN: unknown = JSON.parse(readFileSync(new URL('parity.golden.json', import.meta.url), 'utf8'))

/** The render params that only `plan.approve` writes. */
const PLAN_KEYS = new Set(['plan', 'plan_version', 'shot'])

/** One run request that an approval's execute sent, normalized for comparison. */
interface Call {
  operation: string
  origin: unknown[]
  params: Record<string, unknown>
  inputs: Array<{ role: string; ref: unknown }>
  after: string[] | undefined
  started_by: { record: string; slot: number | null; lane?: string } | undefined
  /** The intent of a render; undefined for the timeline call. */
  intent: string | undefined
}

/** What one approval wrote: the approving record, its calls, its reported records, and every timeline afterwards. */
interface Approval {
  approve: string
  calls: Call[]
  scheduled: string[]
  version: unknown
  timelines: Array<{ id: string; clips: unknown[] }>
}

/** The two projects of a case: `plan` approves with `plan.approve`, `story` with `story.approve`. */
interface Pair {
  plan: ProjectId
  story: ProjectId
}

/**
 * Create the two projects of a case.
 * @param fixture - the composition.
 * @returns the projects.
 */
async function pair(fixture: Fixture): Promise<Pair> {
  const plan = (await fixture.ctx.dvProject.createProject('by plan.approve', { ...USER, intent: 'create' })).id
  const story = (await fixture.ctx.dvProject.createProject('by story.approve', { ...USER, intent: 'create' })).id
  return { plan, story }
}

/**
 * Run the same step in both projects of a case, `plan` first.
 * @param projects - the projects.
 * @param step - the step, given each project.
 */
async function both(projects: Pair, step: (project: ProjectId) => Promise<unknown>): Promise<void> {
  await step(projects.plan)
  await step(projects.story)
}

/**
 * Approve a plan version in one project with `operation`, as the user, and wait for its renders.
 * @param fixture - the composition.
 * @param project - the project.
 * @param operation - `plan.approve` or `story.approve`.
 * @param params - the plan and version.
 * @returns the normalized approval.
 */
async function approval(fixture: Fixture, project: ProjectId, operation: string, params: Record<string, unknown>): Promise<Approval> {
  const run = vi.spyOn(fixture.ctx.dvProject, 'run')
  const record = await fixture.record(operation, params, { project })
  const requests = run.mock.calls.map(([request]) => request).filter(request => request.operation !== operation)
  run.mockRestore()
  await fixture.ctx.dvProject.wait(project)
  const state = fixture.ctx.dvProject.getState(project)
  const records = state.components.proj.records
  const label = (id: RecordId): string => `#${String(records.findIndex(entry => entry.id === id))}`
  const ref = (input: RecordInputRef): unknown => 'record' in input ? { record: label(input.record), output: input.output } : input
  const call = (request: RunRequest): Call => ({
    operation: request.operation,
    origin: [request.actor, request.surface, request.session, request.turn, request.tool_call],
    params: Object.fromEntries(Object.entries(request.params).filter(([key]) => !PLAN_KEYS.has(key))),
    inputs: request.inputs.map(input => ({ role: input.role, ref: ref(input.ref) })),
    after: request.after?.map(label),
    started_by: request.started_by === undefined ? undefined : { ...request.started_by, record: label(request.started_by.record) },
    intent: request.operation === 'shot.render' ? request.intent : undefined,
  })
  const done = records.find(entry => entry.id === record.id)
  const scheduled = done?.report?.['scheduled']
  return {
    approve: label(record.id),
    calls: requests.map(call),
    scheduled: Array.isArray(scheduled) ? scheduled.map(id => label(id as RecordId)) : [],
    version: done?.report?.['version'],
    timelines: state.components.timeline.timelines.map(timeline => ({
      id: timeline.id,
      clips: timeline.clips.map(clip => clip.source === null ? clip.asset : ref(clip.source)),
    })),
  }
}

/**
 * Approve a plan version in both projects of a case, and check that both approvals wrote the same chain, and that the
 * `plan.approve` side equals its golden entry.
 * @param fixture - the composition.
 * @param projects - the projects.
 * @param params - the plan and version.
 * @param name - the approval's key in `parity.golden.json`.
 * @returns the approval of `story.approve`.
 */
async function approveBoth(fixture: Fixture, projects: Pair, params: Record<string, unknown>, name: string): Promise<Approval> {
  const byPlan = await approval(fixture, projects.plan, 'plan.approve', params)
  const byStory = await approval(fixture, projects.story, 'story.approve', params)
  expect(GOLDEN).toHaveProperty([name], byPlan)
  expect(byStory).toEqual(byPlan)
  return byStory
}

/** Each call of an approval as its operation, the records it was scheduled after, and its `started_by` slot. */
function steps(approval: Approval): Array<[string, string[] | undefined, number | null | undefined]> {
  return approval.calls.map(call => [call.operation, call.after, call.started_by?.slot])
}

/** Shot 1 references the plan's picture, shot 2 continues it, shot 3 is text only. */
const SHOTS = [
  { ...REF, prompt: 'Picture 1 starts dancing', duration_sec: 1 },
  { ...REF, prompt: 'keeps dancing', duration_sec: 2, continue_previous: true },
  { ...TXT, prompt: 'A street at dawn', duration_sec: 2 },
]

describe('story.approve parity with plan.approve', () => {
  it('T4.1: (a) v1, (b) v2 with an added shot, and (c) v4 that returns to the v1 shots write the same chain', async () => {
    const fixture = await start()
    const projects = await pair(fixture)
    const picture = fixture.put('face', 'image/png', 'face.png')
    const v1 = { references: [picture], aspect_ratio: '9:16', shots: SHOTS }
    await both(projects, project => fixture.record('plan.create', v1, { project }))
    // (a) Every shot renders, each after the one before; shot 2 starts from shot 1's last still.
    const a = await approveBoth(fixture, projects, { plan: 'p1' }, 'a')
    const [r1, r2, r3] = a.scheduled
    expect(a.scheduled).toHaveLength(4)
    expect(steps(a)).toEqual([['shot.render', [], 1], ['shot.render', [r1], 2], ['shot.render', [r2], 3], ['timeline.create', undefined, null]])
    expect(a.calls[1]?.inputs).toEqual([{ role: 'reference', ref: { asset: picture } }, { role: 'first_frame', ref: { record: r1, output: 1 } }])
    expect(a.calls.map(call => call.started_by?.record)).toEqual([a.approve, a.approve, a.approve, a.approve])
    expect(a.calls.map(call => call.intent)).toEqual(['shot 1 of plan p1 v1', 'shot 2 of plan p1 v1', 'shot 3 of plan p1 v1', undefined])
    expect(a.calls[3]?.params).toEqual({ timeline: 't1' })
    expect(a.timelines).toEqual([{ id: 't1', clips: [r1, r2, r3].map(record => ({ record, output: 0 })) }])
    // (b) Only the added shot renders; it continues shot 3's kept take, and the plan's timeline gets all four takes.
    const v2 = { ...v1, shots: [...SHOTS, { ...REF, prompt: 'dances into the street', duration_sec: 1, continue_previous: true }] }
    await both(projects, project => fixture.record('plan.update', { plan: 'p1', ...v2 }, { project }))
    const b = await approveBoth(fixture, projects, { plan: 'p1' }, 'b')
    const [r4] = b.scheduled
    expect(steps(b)).toEqual([['shot.render', [], 4], ['timeline.update', undefined, null]])
    expect(b.calls[0]?.inputs).toEqual([{ role: 'reference', ref: { asset: picture } }, { role: 'first_frame', ref: { record: r3, output: 1 } }])
    expect(b.timelines).toEqual([{ id: 't1', clips: [r1, r2, r3, r4].map(record => ({ record, output: 0 })) }])
    // (c) v3 changes shot 2 and is never approved; v4 returns to the v1 shots and reuses every v1 take.
    const v3 = { ...v1, shots: [SHOTS[0], { ...SHOTS[1], prompt: 'spins' }, SHOTS[2]] }
    await both(projects, project => fixture.record('plan.update', { plan: 'p1', ...v3 }, { project }))
    await both(projects, project => fixture.record('plan.update', { plan: 'p1', ...v1 }, { project }))
    const c = await approveBoth(fixture, projects, { plan: 'p1' }, 'c')
    expect(c.version).toBe(4)
    expect(steps(c)).toEqual([['timeline.update', undefined, null]])
    expect(c.timelines).toEqual([{ id: 't1', clips: [r1, r2, r3].map(record => ({ record, output: 0 })) }])
  })

  it('T4.1: (e) renders a shot that equals a free take or a take of another plan, because neither belongs to the plan', async () => {
    const fixture = await start()
    const projects = await pair(fixture)
    const picture = fixture.put('face', 'image/png', 'face.png')
    await both(projects, project => fixture.record('plan.create', { references: [picture], aspect_ratio: '9:16', shots: SHOTS }, { project }))
    // The free take has the params and inputs of shot 1's render, without plan params and without started_by.
    const free = { ...SHOTS[0], aspect_ratio: '9:16' }
    const inputs = [{ role: 'reference', ref: { asset: picture } }]
    await both(projects, project => fixture.record('shot.render', free, { project, inputs }))
    // Plan p2's one shot equals shot 1 of p1; each project approves p2 with its own approval.
    await both(projects, project => fixture.record('plan.create', { references: [picture], aspect_ratio: '9:16', shots: [SHOTS[0]] }, { project }))
    await fixture.record('plan.approve', { plan: 'p2' }, { project: projects.plan })
    await fixture.record('story.approve', { plan: 'p2' }, { project: projects.story })
    await both(projects, project => fixture.ctx.dvProject.wait(project))
    const e = await approveBoth(fixture, projects, { plan: 'p1' }, 'e')
    expect(e.calls[0]).toMatchObject({ params: free, inputs, started_by: { slot: 1 } })
    expect(steps(e).map(([operation]) => operation)).toEqual(['shot.render', 'shot.render', 'shot.render', 'timeline.create'])
    expect(e.calls[3]?.params).toEqual({ timeline: 't2' })
  })

  it('T4.1: (f) creates the next timeline when the user re-laid the plan\'s timeline, and leaves that timeline unchanged', async () => {
    const fixture = await start()
    const projects = await pair(fixture)
    await both(projects, project => fixture.record('plan.create', { shots: [SHOTS[2], { ...SHOTS[2], prompt: 'A street at noon' }] }, { project }))
    const first = await approveBoth(fixture, projects, { plan: 'p1' }, 'f-first')
    const [r1, r2] = first.scheduled
    // The user keeps only shot 2 on t1. That timeline.update has no started_by, so no approval of the plan wrote t1 last.
    await both(projects, async (project) => {
      const take = fixture.ctx.dvProject.getState(project).components.timeline.timelines[0]?.clips[1]?.source
      if (take == null) throw new Error('t1 has no clip of shot 2')
      await fixture.record('timeline.update', { timeline: 't1' }, { project, inputs: [{ role: 'clip', ref: take }] })
    })
    const f = await approveBoth(fixture, projects, { plan: 'p1' }, 'f')
    expect(steps(f)).toEqual([['timeline.create', undefined, null]])
    expect(f.calls[0]?.params).toEqual({ timeline: 't2' })
    expect(f.timelines).toEqual([
      { id: 't1', clips: [{ record: r2, output: 0 }] },
      { id: 't2', clips: [r1, r2].map(record => ({ record, output: 0 })) },
    ])
  })

  it('T4.1: (h) passes the plan\'s seed and resolution, and a shot\'s own seed, to each render', async () => {
    const fixture = await start()
    const projects = await pair(fixture)
    const shots = [{ ...SHOTS[2], duration_sec: 1 }, { ...SHOTS[2], prompt: 'A street at noon', duration_sec: 1, seed: 9 }]
    await both(projects, project => fixture.record('plan.create', { resolution: '720p', seed: 7, shots }, { project }))
    const h = await approveBoth(fixture, projects, { plan: 'p1' }, 'h')
    expect(h.calls.map(call => call.params)).toEqual([
      { ...TXT, prompt: 'A street at dawn', duration_sec: 1, resolution: '720p', seed: 7 },
      { ...TXT, prompt: 'A street at noon', duration_sec: 1, resolution: '720p', seed: 9 },
      { timeline: 't1' },
    ])
  })
})
