/**
 * The Shot plan component in a REAL composition: a test-only `cordis.yml` boots the DSH tool registry, `dvProject`,
 * `dvFfmpeg`, the asset pool, `dvTimeline`, the model catalog `dvModels` and `dvShotPlan` through the Loader. The
 * catalog holds the stand-in model `fake` of provider `test`, whose tasks each test chooses. A stand-in for the Shot
 * render operation `shot.render`, registered with `dvProject`, parses the references of a plan and estimates the GPU
 * seconds of each shot in the reports of `plan.create` and `plan.update`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import DvAssetPool from '@dv/asset-pool'
import DvFfmpeg from '@dv/ffmpeg'
import DvModels, { type ModelEntry, type TaskId } from '@dv/models'
import DvProject, {
  type AssetId, type OperationSpec, type OperationToolValue, type ProjectId, type ProjectRecord, type RecordId, type RunRequest,
  type SessionId,
} from '@dv/project'
import DvTimeline from '@dv/timeline'
import { afterEach, describe, expect, it } from 'vitest'
import DvShotPlan, { type PlanId, type Shot } from '../src/index.ts'

const FFMPEG = process.env['DV_FFMPEG'] ?? '/mnt/lustre/vlm-d1su/opt/ffmpeg-native/bin/ffmpeg'
const FFPROBE = process.env['DV_FFPROBE'] ?? 'ffprobe'

/** The plugin classes the fixture rows resolve through `globalThis`, because Node imports the rows outside Vite. */
const PLUGINS = { SystemPrompt, ToolRuntime, DvProject, DvFfmpeg, DvAssetPool, DvTimeline, DvModels, DvShotPlan }

/** A user action outside any chat session: it lands on `main` directly. */
const USER = { actor: 'user' as const, surface: 'canvas' as const, session: null, turn: null, tool_call: null }

interface Fixture {
  ctx: Context
  project: ProjectId
  /** Store bytes in the asset pool. */
  put(bytes: string, mime: string, name: string): AssetId
  /** Run one tool as the agent of chat session `s1`, which is bound to `project`. */
  call(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult>
  /** Run one operation on `main` as the user and return its record. */
  record(operation: string, params: Record<string, unknown>, extra?: Partial<RunRequest>): Promise<ProjectRecord>
  /** The records of the project's `main` that ran one operation. */
  recordsOf(operation: string): ProjectRecord[]
}

const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

/** What a test changes in the composition: the tasks of the catalog model `fake`. */
interface StartOptions {
  /** The tasks the catalog model `fake` serves, one entry each; both by default. */
  tasks?: TaskId[]
}

/** The GPU seconds the stand-in render estimates per video second. */
const GPU_SECONDS_PER_VIDEO_SECOND = 4

/**
 * A catalog entry of a stand-in model of provider `test`. The stand-in `shot.render` never reads its facts or schema or
 * renders with it, so they reject.
 * @param name - the model name.
 * @param task - the task the entry serves.
 * @returns the entry.
 */
function model(name: string, task: TaskId): ModelEntry {
  return {
    modality: 'video', task, provider: 'test', model: name, description: 'stand-in', gpuSecondsPerVideoSecond: GPU_SECONDS_PER_VIDEO_SECOND,
    facts: () => Promise.reject(new Error(`${name} has no backend.`)),
    schema: () => Promise.reject(new Error(`${name} has no backend.`)),
    validateGenerationRequest: () => Promise.resolve([]),
    render: () => { throw new Error(`${name} has no backend.`) },
  }
}

/**
 * The stand-in for the Shot render operation: its name, params, input roles, output order and estimate match the real
 * Shot render component.
 * @returns the spec.
 */
function standIn(): OperationSpec {
  return {
    name: 'shot.render', component: 'shot', version: '1', description: 'stand-in', deterministic: false, confirm: 'never',
    resource: 'gpu', summarize: () => 'stand-in',
    params: {
      modality: { type: 'string', required: true }, task: { type: 'string', required: true }, provider: { type: 'string', required: true },
      model: { type: 'string', required: true }, prompt: { type: 'string', required: true },
      plan: { type: 'string' }, plan_version: { type: 'integer' }, shot: { type: 'integer' }, duration_sec: { type: 'integer' },
      aspect_ratio: { type: 'string' }, resolution: { type: 'string' }, seed: { type: 'integer' },
    },
    inputs: {
      reference: { type: 'image', many: true, bible: true, description: 'References.' },
      first_frame: { type: 'image', description: 'The first frame.' },
    },
    outputs: [{ role: 'video', type: 'video' }, { role: 'last_still', type: 'image' }],
    estimate: ({ duration_sec: duration }) => ({ gpu_seconds: (typeof duration === 'number' ? duration : 5) * GPU_SECONDS_PER_VIDEO_SECOND }),
    execute: context => Promise.resolve({
      outputs: [
        context.importAsset(Buffer.from(`video ${String(context.params['prompt'])}`), { mime: 'video/mp4', name: 'shot.mp4' }),
        context.importAsset(Buffer.from(`frame ${String(context.params['prompt'])}`), { mime: 'image/png', name: 'last.png' }),
      ],
    }),
  }
}

/**
 * Boot the composition from a test-only `cordis.yml`, with the stand-in render and the model `fake` registered beside it.
 * @param options - the tasks of `fake`.
 * @returns the fixture, with a project bound to chat session `s1`.
 */
async function start(options: StartOptions = {}): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'dv-shot-plan-'))
  const globals = globalThis as typeof globalThis & { __dvShotPlanComposition?: typeof PLUGINS }
  globals.__dvShotPlanComposition = PLUGINS
  const rows: string[] = []
  const row = (id: string, key: keyof typeof PLUGINS, config: string[]): void => {
    writeFileSync(join(dir, `${id}.mjs`), `export default globalThis.__dvShotPlanComposition.${key}\n`)
    rows.push(`- id: ${id}`, `  name: ${pathToFileURL(join(dir, `${id}.mjs`)).href}`, ...config.length === 0 ? [] : ['  config:', ...config.map(line => `    ${line}`)])
  }
  row('system-prompt', 'SystemPrompt', [])
  row('tools', 'ToolRuntime', [])
  row('dv-project', 'DvProject', [`root: ${join(dir, 'projects')}`, `sessionRoot: ${join(dir, 'sessions')}`])
  row('dv-ffmpeg', 'DvFfmpeg', [`ffmpegPath: ${FFMPEG}`, `ffprobePath: ${FFPROBE}`])
  row('dv-asset-pool', 'DvAssetPool', [`root: ${join(dir, 'assets')}`])
  row('dv-timeline', 'DvTimeline', [])
  row('dv-models', 'DvModels', [])
  row('dv-shot-plan', 'DvShotPlan', [])
  writeFileSync(join(dir, 'cordis.yml'), `${rows.join('\n')}\n`)

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
  await ctx.loader.await()
  const tasks: TaskId[] = options.tasks ?? ['ref2v', 't2v']
  const removers = [
    ctx.dvProject.registerComponent('shot'), ctx.dvProject.registerOperation(standIn()), ...tasks.map(task => ctx.dvModels.register(model('fake', task))),
  ]
  disposers.push(async () => {
    for (const remove of removers) remove()
    await ctx.fiber.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  const project = (await ctx.dvProject.createProject('plans', { ...USER, intent: 'create' })).id
  ctx.dvProject.bindSession(brandString<SessionId>('s1'), project)
  let calls = 0
  return {
    ctx, project,
    put: (bytes, mime, name) => ctx.dvAssetPool.importAsset(Buffer.from(bytes), { mime, name }, null),
    call(name, args) {
      calls += 1
      return ctx.tools.execute({ callId: ToolCallId(`call-${calls}`), name, arguments: args, signal: new AbortController().signal, agent: { id: 's1' } as never })
    },
    async record(operation, params, extra = {}) {
      const result = await ctx.dvProject.run({ ...USER, project, operation, params, inputs: [], intent: operation, ...extra })
      if (result.record === null) throw new Error(`${operation} wrote no record`)
      return result.record
    },
    recordsOf: operation => ctx.dvProject.getState(project).components.proj.records.filter(record => record.operation === operation),
  }
}

/** The value of a successful operation tool call. */
function value(result: ToolExecutionResult): OperationToolValue {
  if (result.isError) throw new Error(result.error.message)
  return result.value as OperationToolValue
}

/** The spec of a registered operation. */
function spec(fixture: Fixture, name: string): OperationSpec | undefined {
  return fixture.ctx.dvProject.listOperations().find(entry => entry.name === name)
}

/** The model key of the model `fake` in task `ref2v`. */
const REF = { modality: 'video', task: 'ref2v', provider: 'test', model: 'fake' }

/** The model key of the model `fake` in task `t2v`. */
const TXT = { ...REF, task: 't2v' }

/** A shot of the model `fake` in task `ref2v` with a prompt and the other fields given. */
function ref(prompt: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...REF, prompt, ...fields }
}

describe('dvShotPlan', () => {
  it('registers plan.create and plan.update with their dv_plan_* tools and the plan reducer, and removes them on disposal', async () => {
    const fixture = await start()
    const specs = fixture.ctx.dvProject.listOperations().filter(entry => entry.component === 'plan')
    expect(specs.map(entry => [entry.name, entry.confirm, entry.deterministic])).toEqual([['plan.create', 'never', true], ['plan.update', 'never', true]])
    for (const name of ['dv_plan_create', 'dv_plan_update']) expect(fixture.ctx.tools.get(name), name).toBeDefined()
    // The agent approves plans through a workflow plugin: no plan tool approves, and no description names an approval or its cost.
    expect(fixture.ctx.tools.get('dv_plan_approve')).toBeUndefined()
    for (const name of ['dv_plan_create', 'dv_plan_update']) {
      expect(fixture.ctx.tools.schemas().find(tool => tool.name === name)?.description, name).not.toMatch(/approv|gpu_seconds/u)
    }
    expect(fixture.ctx.dvProject.getState(fixture.project).components.plan).toEqual({ plans: {} })
    const entry = [...fixture.ctx.loader.entries()].find(candidate => candidate.options.name.endsWith('/dv-shot-plan.mjs'))
    await entry?.fiber?.dispose()
    expect(fixture.ctx.dvProject.listOperations().filter(candidate => candidate.component === 'plan')).toEqual([])
    expect(fixture.ctx.tools.get('dv_plan_create')).toBeUndefined()
    expect(fixture.ctx.dvProject.getState(fixture.project).components).not.toHaveProperty('plan')
  })

  it('stores the agent\'s plan as JSON under a new plan ID with its shot lines and GPU estimate, and writes the next version', async () => {
    const fixture = await start()
    const picture = fixture.put('face', 'image/png', 'face.png')
    const shots = [ref('Picture 1 starts dancing', { duration_sec: 1 }), ref('keeps dancing', { duration_sec: 2, continue_previous: true })]
    const created = value(await fixture.call('dv_plan_create', { reason: 'propose', title: 'dance', references: [picture], shots }))
    expect(created).toMatchObject({ status: 'done', summary: 'plan with 2 shots', outputs: [{ role: 'plan', mime: 'application/json' }] })
    // The report shows what approving the plan renders and its GPU estimate (duration × 4 GPU seconds per video second).
    expect(created.report).toEqual({
      plan: 'p1', version: 1, gpu_seconds: 3 * GPU_SECONDS_PER_VIDEO_SECOND,
      shots: [
        'shot 1 (video/ref2v/test/fake, 1 s): Picture 1 starts dancing',
        'shot 2 (video/ref2v/test/fake, 2 s, continues from the previous shot): keeps dancing',
      ],
    })
    const record = fixture.ctx.dvProject.getRecord(fixture.project, brandString<RecordId>(created.record))
    expect(record).toMatchObject({
      actor: 'agent', surface: 'chat', component: 'plan', operation: 'plan.create', intent: 'propose', inputs: [],
      params: { title: 'dance', references: [picture], shots },
    })
    const stored = JSON.parse(fixture.ctx.dvAssetPool.read(record.outputs[0] as AssetId).toString('utf8')) as unknown
    expect(stored).toEqual({ title: 'dance', references: [picture], shots })
    const one = { ...TXT, prompt: 'one' }
    const revised = value(await fixture.call('dv_plan_update', { reason: 'shorter', plan: 'p1', shots: [one] }))
    expect(revised).toMatchObject({
      summary: 'plan updated (1 shots)',
      report: { plan: 'p1', version: 2, shots: ['shot 1 (video/t2v/test/fake): one'], gpu_seconds: 5 * GPU_SECONDS_PER_VIDEO_SECOND },
    })
    const state = fixture.ctx.dvProject.getState(fixture.project)
    expect(state.components.plan.plans).toEqual({
      p1: [
        { title: 'dance', references: [picture], shots, version: 1, created_by: created.record, approved_by: null },
        { shots: [one], version: 2, created_by: revised.record, approved_by: null },
      ],
    })
    expect(fixture.ctx.dvShotPlan.get(state, 'p1')).toMatchObject({ version: 2 })
    expect(fixture.ctx.dvShotPlan.get(state, 'p1', 1)).toMatchObject({ version: 1, title: 'dance' })
    // A second plan gets the next ID; plan IDs are never reused within the project.
    const other = value(await fixture.call('dv_plan_create', { reason: 'another story', shots: [ref('x')] }))
    expect(other.report).toMatchObject({ plan: 'p2', version: 1 })
    expect(spec(fixture, 'plan.create')?.summarize({ ...record, params: {} })).toBe('plan with 0 shots')
    // A shot without a model or a task is refused by the tool's params.
    const { model: _model, ...noModel } = TXT
    const { task: _task, ...noTask } = TXT
    expect((await fixture.call('dv_plan_create', { reason: 'no model', shots: [{ ...noModel, prompt: 'x' }] })).isError).toBe(true)
    expect((await fixture.call('dv_plan_create', { reason: 'no task', shots: [{ ...noTask, prompt: 'x' }] })).isError).toBe(true)
  })

  it('resolves each shot of a version with the plan values, references and continuation that apply to it', async () => {
    const fixture = await start()
    const picture = fixture.put('face', 'image/png', 'face.png')
    const hat = fixture.put('hat', 'image/png', 'hat.png')
    const shots = [ref('one'), ref('two', { references: [hat], seed: 9, continue_previous: true }), { ...TXT, prompt: 'three' }]
    await fixture.record('plan.create', { references: [picture], aspect_ratio: '16:9', resolution: '720p', seed: 7, shots })
    await fixture.record('plan.update', { plan: 'p1', shots: [{ ...TXT, prompt: 'solo' }] })
    const state = fixture.ctx.dvProject.getState(fixture.project)
    const plan = { aspect_ratio: '16:9', resolution: '720p' }
    expect(fixture.ctx.dvShotPlan.shots(state, 'p1', 1)).toEqual([
      { slot: 1, shot: shots[0], ...plan, seed: 7, references: [picture], continuePrevious: false },
      { slot: 2, shot: shots[1], ...plan, seed: 9, references: [hat], continuePrevious: true },
      { slot: 3, shot: shots[2], ...plan, seed: 7, references: [], continuePrevious: false },
    ])
    // The latest version by default; a version without plan values resolves shots without them.
    expect(fixture.ctx.dvShotPlan.shots(state, 'p1')).toEqual([{ slot: 1, shot: { ...TXT, prompt: 'solo' }, references: [], continuePrevious: false }])
    expect(() => fixture.ctx.dvShotPlan.shots(state, 'p1', 3)).toThrow("Plan 'p1' has no version 3; it has 2.")
    // A stored version that the plan checks refuse: shot 1 and a shot of task t2v never continue, and t2v takes no references.
    const key = { modality: 'video', provider: 'test', model: 'fake' } as const
    const loose: Shot[] = [
      { ...key, task: 'ref2v', prompt: 'a', continue_previous: true }, { ...key, task: 't2v', prompt: 'b', references: [hat], continue_previous: true },
    ]
    const version = { shots: loose, version: 1, created_by: brandString<RecordId>('r1'), approved_by: null }
    const unchecked = { ...state, components: { ...state.components, plan: { plans: { [brandString<PlanId>('p9')]: [version] } } } }
    expect(fixture.ctx.dvShotPlan.shots(unchecked, 'p9').map(entry => [entry.references, entry.continuePrevious])).toEqual([[[], false], [[], false]])
  })

  it('refuses a plan before its record when a shot names a model the catalog does not serve or breaks a rule of its task', async () => {
    // fake serves only task ref2v.
    const fixture = await start({ tasks: ['ref2v'] })
    const picture = fixture.put('face', 'image/png', 'face.png')
    const before = fixture.ctx.dvProject.listHistory({ project: fixture.project }).length
    await expect(fixture.record('plan.create', {
      references: [picture], shots: [ref('a'), { ...TXT, prompt: 'b' }, { ...REF, model: 'ghost', prompt: 'c' }],
    })).rejects.toThrow(
      'The plan cannot be rendered as written. '
      + 'Shot 2 uses model video/t2v/test/fake, which is not in the model catalog; call dv_models_list for the models. '
      + 'Shot 3 uses model video/ref2v/test/ghost, which is not in the model catalog; call dv_models_list for the models.',
    )
    // plain serves only task t2v, which takes no references and no first frame.
    const removePlain = fixture.ctx.dvModels.register(model('plain', 't2v'))
    const plain = { ...TXT, model: 'plain' }
    const refused = await fixture.call('dv_plan_create', {
      reason: 'rules',
      shots: [ref('a', { continue_previous: true }), { ...plain, prompt: 'b', references: [picture], continue_previous: true }],
    })
    expect(refused.isError && refused.error.message).toBe([
      'The plan cannot be rendered as written.',
      'Shot 1 has no previous shot to continue; remove its continue_previous.',
      'Shot 2 uses task t2v, which takes no references; remove its references or use task ref2v.',
      'Shot 2 uses task t2v, which takes no first frame; remove its continue_previous or use task ref2v.',
    ].join(' '))
    expect(fixture.ctx.dvProject.listHistory({ project: fixture.project })).toHaveLength(before)
    // A prompt cites the first frame only in a shot that continues the previous shot.
    const firstFrame = '@[首帧](dv:input/first_frame) is the first frame'
    const cited = await fixture.call('dv_plan_create', {
      reason: 'first frame',
      shots: [ref(firstFrame, { continue_previous: true }), ref(firstFrame), ref(firstFrame, { continue_previous: true })],
    })
    expect(cited.isError && cited.error.message).toBe([
      'The plan cannot be rendered as written.',
      'Shot 1 has no previous shot to continue; remove its continue_previous.',
      'Shot 1 cites the first frame but does not continue the previous shot; set continue_previous or remove the citation.',
      'Shot 2 cites the first frame but does not continue the previous shot; set continue_previous or remove the citation.',
    ].join(' '))
    // plan.update checks the same rules, also for a stored plan whose model left the catalog.
    await fixture.record('plan.create', { references: [picture], shots: [ref('a')] })
    const shots = [{ ...plain, prompt: 'b' }]
    await fixture.record('plan.update', { plan: 'p1', shots })
    removePlain()
    const unknown = 'Shot 1 uses model video/t2v/test/plain, which is not in the model catalog; call dv_models_list for the models.'
    await expect(fixture.record('plan.update', { plan: 'p1', shots })).rejects.toThrow(unknown)
  })

  it('fails plans without shots, and refuses updates of unknown plans and unknown references', async () => {
    const fixture = await start()
    const empty = await fixture.record('plan.create', { shots: [] })
    expect(empty).toMatchObject({ status: 'failed', error: { code: 'operation_failed', message: 'plan.create needs at least one shot.' } })
    await expect(fixture.record('plan.create', { title: 'no shots' })).rejects.toMatchObject({ code: 'invalid_params' })
    await expect(fixture.record('plan.update', { plan: 'p1', shots: [ref('x')] })).rejects.toThrow("Unknown plan 'p1'")
    expect(fixture.ctx.dvProject.getState(fixture.project).components.plan.plans).toEqual({})
    // An unknown reference is refused before the record, for the plan's references and a shot's own.
    const before = fixture.ctx.dvProject.listHistory({ project: fixture.project }).length
    await expect(fixture.record('plan.create', { references: ['c9@1'], shots: [ref('x')] }))
      .rejects.toThrow("Unknown version 'c9@1'; reference kinds: none.")
    expect(fixture.ctx.dvProject.listHistory({ project: fixture.project })).toHaveLength(before)
    await fixture.record('plan.create', { shots: [{ ...TXT, prompt: 'x' }] })
    await expect(fixture.record('plan.update', { plan: 'p1', shots: [ref('x', { references: ['s9@1'] })] }))
      .rejects.toThrow("Unknown version 's9@1'; reference kinds: none.")
    expect((await fixture.record('plan.update', { plan: 'p1', shots: [] })).error?.message).toBe('plan.update needs at least one shot.')
    expect(fixture.recordsOf('shot.render')).toEqual([])
    expect(() => fixture.ctx.dvShotPlan.get(fixture.ctx.dvProject.getState(fixture.project), 'ghost')).toThrow("Unknown plan 'ghost'")
  })
})
