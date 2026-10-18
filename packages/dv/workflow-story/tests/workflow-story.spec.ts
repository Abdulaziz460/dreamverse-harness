/**
 * The story workflow in a REAL composition: a test-only `cordis.yml` boots the DSH tool registry, `dvProject`,
 * `dvFfmpeg`, the asset pool, `dvTimeline`, the model catalog `dvModels`, `dvShotRender`, `dvShotPlan` and `dvStory`
 * through the Loader. The only fake is the model `fake` of provider `test`, one entry per task, whose validation each
 * test chooses and whose render streams a few bytes as the video and the last still.
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
import DvModels, { type ModelEntry, type RenderModelFacts, type RenderRequest, type TaskId } from '@dv/models'
import DvProject, {
  type AssetId, type OperationSpec, type OperationToolValue, type ProjectId, type ProjectRecord, type RecordId, type RunRequest,
  type SessionId,
} from '@dv/project'
import DvShotPlan from '@dv/shot-plan'
import DvShotRender from '@dv/shot-render'
import DvTimeline from '@dv/timeline'
import { afterEach, describe, expect, it } from 'vitest'
import DvStory from '../src/index.ts'

const FFMPEG = process.env['DV_FFMPEG'] ?? '/mnt/lustre/vlm-d1su/opt/ffmpeg-native/bin/ffmpeg'
const FFPROBE = process.env['DV_FFPROBE'] ?? 'ffprobe'

/** The plugin classes the fixture rows resolve through `globalThis`, because Node imports the rows outside Vite. */
const PLUGINS = { SystemPrompt, ToolRuntime, DvProject, DvFfmpeg, DvAssetPool, DvTimeline, DvModels, DvShotRender, DvShotPlan, DvStory }

/** A user action outside any chat session: it lands on `main` directly. */
const USER = { actor: 'user' as const, surface: 'canvas' as const, session: null, turn: null, tool_call: null }

/** Facts with one small frame size per aspect ratio and durations of 1 to 3 seconds. */
const FACTS: RenderModelFacts = {
  modelId: 'test-fake', aspectRatios: ['16:9', '9:16'], resolutions: ['720p'],
  frameSizes: { '16:9': { '720p': [192, 112] }, '9:16': { '720p': [112, 192] } }, minDurationSec: 1, maxDurationSec: 3,
  numFramesByDurationSec: { 1: 25, 2: 49, 3: 73 },
}

/** The problems the validation of the model `fake` reports for a request, by task; none by default. */
type Checks = Record<TaskId, (request: RenderRequest) => string[]>

/**
 * A catalog entry of the model `fake`: 3 GPU seconds per video second in task `ref2v`, 1.5 in task `t2v`.
 * @param task - the task the entry serves.
 * @param checks - the validation of each task.
 * @returns the entry.
 */
function fake(task: TaskId, checks: Checks): ModelEntry {
  return {
    modality: 'video', task, provider: 'test', model: 'fake', description: 'stand-in', gpuSecondsPerVideoSecond: task === 'ref2v' ? 3 : 1.5,
    facts: () => Promise.resolve(FACTS),
    schema: () => Promise.resolve({}),
    validateGenerationRequest: request => Promise.resolve(checks[task](request)),
    async *render() {
      yield { kind: 'last_frame', png: Buffer.from('png') }
      yield { kind: 'video_start', mime: 'video/mp4' }
      yield { kind: 'chunk', bytes: Buffer.from('mp4') }
      yield { kind: 'done', timings: {} }
    },
  }
}

interface Fixture {
  ctx: Context
  project: ProjectId
  checks: Checks
  /** Store bytes in the asset pool. */
  put(bytes: string, mime: string, name: string): AssetId
  /** Run one tool as the agent of chat session `s1`, which is bound to `project`. */
  call(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult>
  /** Run one operation on `main` as the user and return its record. */
  record(operation: string, params: Record<string, unknown>): Promise<ProjectRecord>
  /** Render one take as the user with `dvShotRender.render`, started by a record at a slot when one is given. */
  take(params: Record<string, unknown>, inputs?: RunRequest['inputs'], started?: { record: RecordId; slot: number }): Promise<RecordId>
}

const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

/**
 * Boot the composition from a test-only `cordis.yml`, with the model `fake` in tasks `ref2v` and `t2v`.
 * @returns the fixture, with a project bound to chat session `s1`.
 */
async function start(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'dv-workflow-story-'))
  const globals = globalThis as typeof globalThis & { __dvStoryComposition?: typeof PLUGINS }
  globals.__dvStoryComposition = PLUGINS
  const rows: string[] = []
  const row = (id: string, key: keyof typeof PLUGINS, config: string[]): void => {
    writeFileSync(join(dir, `${id}.mjs`), `export default globalThis.__dvStoryComposition.${key}\n`)
    rows.push(`- id: ${id}`, `  name: ${pathToFileURL(join(dir, `${id}.mjs`)).href}`, ...config.length === 0 ? [] : ['  config:', ...config.map(line => `    ${line}`)])
  }
  row('system-prompt', 'SystemPrompt', [])
  row('tools', 'ToolRuntime', [])
  row('dv-project', 'DvProject', [`root: ${join(dir, 'projects')}`, `sessionRoot: ${join(dir, 'sessions')}`])
  row('dv-ffmpeg', 'DvFfmpeg', [`ffmpegPath: ${FFMPEG}`, `ffprobePath: ${FFPROBE}`])
  row('dv-asset-pool', 'DvAssetPool', [`root: ${join(dir, 'assets')}`])
  row('dv-timeline', 'DvTimeline', [])
  row('dv-models', 'DvModels', [])
  row('dv-shot-render', 'DvShotRender', [])
  row('dv-shot-plan', 'DvShotPlan', [])
  row('dv-story', 'DvStory', [])
  writeFileSync(join(dir, 'cordis.yml'), `${rows.join('\n')}\n`)

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
  await ctx.loader.await()
  const checks: Checks = { ref2v: () => [], t2v: () => [] }
  const removers = (['ref2v', 't2v'] as const).map(task => ctx.dvModels.register(fake(task, checks)))
  disposers.push(async () => {
    for (const remove of removers) remove()
    await ctx.fiber.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  const project = (await ctx.dvProject.createProject('story', { ...USER, intent: 'create' })).id
  ctx.dvProject.bindSession(brandString<SessionId>('s1'), project)
  let calls = 0
  return {
    ctx, project, checks,
    put: (bytes, mime, name) => ctx.dvAssetPool.importAsset(Buffer.from(bytes), { mime, name }, null),
    call(name, args) {
      calls += 1
      return ctx.tools.execute({ callId: ToolCallId(`call-${calls}`), name, arguments: args, signal: new AbortController().signal, agent: { id: 's1' } as never })
    },
    async record(operation, params) {
      const result = await ctx.dvProject.run({ ...USER, project, operation, params, inputs: [], intent: operation })
      if (result.record === null) throw new Error(`${operation} wrote no record`)
      return result.record
    },
    take: (params, inputs = [], started) => ctx.dvShotRender.render({
      ...USER, project, params, inputs, intent: 'take', ...started === undefined ? {} : { started_by: started },
    }),
  }
}

/** The report of a successful `dv_story_preview` call of a plan, at a version when one is given. */
async function preview(fixture: Fixture, plan: string, version?: number): Promise<OperationToolValue['report']> {
  const result = await fixture.call('dv_story_preview', { reason: 'show the cost', plan, ...version === undefined ? {} : { version } })
  if (result.isError) throw new Error(result.error.message)
  return (result.value as OperationToolValue).report
}

/** The spec of `story.preview` while it is registered. */
function previewSpec(fixture: Fixture): OperationSpec | undefined {
  return fixture.ctx.dvProject.listOperations().find(entry => entry.name === 'story.preview')
}

/**
 * Register a stand-in `story.approve` on the `story` component, so a test can write the starter records of story
 * chains before the workflow registers its own approval.
 */
function standInApprove(fixture: Fixture): void {
  fixture.ctx.dvProject.registerOperation({
    name: 'story.approve', component: 'story', version: '1', description: 'stand-in', params: { plan: { type: 'string', required: true } },
    inputs: {}, outputs: [], deterministic: false, resource: 'none', confirm: 'never', summarize: () => 'stand-in',
    execute: () => Promise.resolve({ outputs: [] }),
  })
}

/** A reference input of an asset. */
function reference(asset: AssetId): RunRequest['inputs'][number] {
  return { role: 'reference', ref: { asset } }
}

/** The model key of the model `fake` in task `ref2v`. */
const REF = { modality: 'video', task: 'ref2v', provider: 'test', model: 'fake' }

/** The model key of the model `fake` in task `t2v`. */
const TXT = { ...REF, task: 't2v' }

describe('dvStory', () => {
  it('registers story.preview as a labeled read with the tool dv_story_preview, and removes it on disposal', async () => {
    const fixture = await start()
    const spec = previewSpec(fixture)
    expect(spec).toMatchObject({
      component: 'story', label: { zh: '预览分镜计划', en: 'Preview plan' }, readOnly: true, confirm: 'never', deterministic: false,
      resource: 'none', inputs: {}, outputs: [],
    })
    expect(spec?.summarize({} as never)).toBe('story preview')
    expect(fixture.ctx.tools.schemas().find(tool => tool.name === 'dv_story_preview')?.description).toContain('A read that writes no record.')
    const entry = [...fixture.ctx.loader.entries()].find(candidate => candidate.options.name.endsWith('/dv-story.mjs'))
    await entry?.fiber?.dispose()
    expect(previewSpec(fixture)).toBeUndefined()
    expect(fixture.ctx.tools.get('dv_story_preview')).toBeUndefined()
  })

  it('previews the shots a version renders and their GPU estimate, without writing', async () => {
    const fixture = await start()
    const picture = fixture.put('face', 'image/png', 'face.png')
    const dawn = { ...TXT, prompt: 'A street at dawn', duration_sec: 2 }
    const shots = [{ ...REF, prompt: 'Picture 1 starts dancing', duration_sec: 1 }, { ...REF, prompt: 'keeps dancing', duration_sec: 2, continue_previous: true }, dawn]
    await fixture.call('dv_plan_create', { reason: 'propose', references: [picture], aspect_ratio: '9:16', shots })
    const history = fixture.ctx.dvProject.listHistory({ project: fixture.project }).length
    const dawnLine = 'shot 3 (video/t2v/test/fake, 2 s): A street at dawn'
    const firstLines = [
      'shot 1 (video/ref2v/test/fake, 1 s): Picture 1 starts dancing',
      'shot 2 (video/ref2v/test/fake, 2 s, continues from the previous shot): keeps dancing',
    ]
    expect(await preview(fixture, 'p1')).toEqual({
      plan: 'p1', version: 1, shots: [...firstLines, dawnLine], rendered: 3, gpu_seconds: 1 * 3 + 2 * 3 + 2 * 1.5, problems: [],
    })
    expect(fixture.ctx.dvProject.listHistory({ project: fixture.project })).toHaveLength(history)
    const night = { ...TXT, prompt: `A street at night ${'and rain '.repeat(10)}`, duration_sec: 2 }
    await fixture.call('dv_plan_update', { reason: 'night', plan: 'p1', references: [picture], aspect_ratio: '9:16', shots: [shots[0], shots[1], night] })
    const nightLine = `shot 3 (video/t2v/test/fake, 2 s): ${night.prompt.slice(0, 80)}…`
    expect(await preview(fixture, 'p1')).toMatchObject({ version: 2, shots: [...firstLines, nightLine] })
    expect(await preview(fixture, 'p1', 1)).toMatchObject({ version: 1, shots: [...firstLines, dawnLine] })
  })

  it('keeps only takes whose chain starts at a story approval of the plan', async () => {
    const fixture = await start()
    standInApprove(fixture)
    const picture = fixture.put('face', 'image/png', 'face.png')
    const shots = [
      { ...REF, prompt: 'Picture 1 starts dancing', duration_sec: 1 }, { ...REF, prompt: 'keeps dancing', duration_sec: 2, continue_previous: true },
      { ...TXT, prompt: 'A street at dawn', duration_sec: 2 },
    ]
    await fixture.call('dv_plan_create', { reason: 'propose', references: [picture], aspect_ratio: '9:16', shots })
    // A plan.approve take carries the plan params and starts at no story approval, so the story workflow renders again.
    await fixture.record('plan.approve', { plan: 'p1' })
    await fixture.ctx.dvProject.wait(fixture.project)
    expect(await preview(fixture, 'p1')).toMatchObject({ rendered: 3 })
    // The render params that the walk gives each shot: the shot's model key, prompt and duration, and the plan's aspect ratio.
    const dancing = { ...REF, prompt: 'Picture 1 starts dancing', duration_sec: 1, aspect_ratio: '9:16' }
    const continuing = { ...REF, prompt: 'keeps dancing', duration_sec: 2, aspect_ratio: '9:16' }
    const dawn = { ...TXT, prompt: 'A street at dawn', duration_sec: 2, aspect_ratio: '9:16' }
    // A free take with equal params, and a take of a story approval of another plan, are not takes of this plan.
    await fixture.take(dawn)
    const other = await fixture.record('story.approve', { plan: 'p2' })
    await fixture.take(dawn, [], { record: other.id, slot: 3 })
    expect(await preview(fixture, 'p1')).toMatchObject({ rendered: 3 })
    const approve = await fixture.record('story.approve', { plan: 'p1' })
    await fixture.take(dawn, [], { record: approve.id, slot: 3 })
    expect(await preview(fixture, 'p1')).toMatchObject({ rendered: 2, gpu_seconds: 1 * 3 + 2 * 3 })
    // A continuing shot after a kept take matches with that take's last still as its first frame.
    const first = await fixture.take(dancing, [reference(picture)], { record: approve.id, slot: 1 })
    await fixture.take(continuing, [reference(picture), { role: 'first_frame', ref: { record: first, output: 1 } }], { record: approve.id, slot: 2 })
    expect(await preview(fixture, 'p1')).toEqual({
      plan: 'p1', version: 1, rendered: 0, gpu_seconds: 0, problems: [],
      shots: ['shot 1: keeps its take', 'shot 2: keeps its take', 'shot 3: keeps its take'],
    })
  })

  it('lists why each shot that renders would be refused, with a kept take as the first frame of a continuing shot', async () => {
    const fixture = await start()
    standInApprove(fixture)
    fixture.checks.t2v = request => request.prompt.includes('night') ? ['It renders no night.'] : []
    fixture.checks.ref2v = request => request.firstFrame === null ? [] : ['It takes no first frame.']
    const shots = [{ ...REF, prompt: 'dances' }, { ...REF, prompt: 'keeps dancing', continue_previous: true }, { ...TXT, prompt: 'A street at night' }]
    await fixture.call('dv_plan_create', { reason: 'propose', shots })
    const nightProblem = 'Shot 3: Model video/t2v/test/fake cannot generate this: It renders no night.'
    // Shot 2 continues a shot that renders, so its first frame is chained and the model check waits for the render.
    expect(await preview(fixture, 'p1')).toMatchObject({ rendered: 3, gpu_seconds: 5 * 3 + 5 * 3 + 5 * 1.5, problems: [nightProblem] })
    const approve = await fixture.record('story.approve', { plan: 'p1' })
    await fixture.take({ ...REF, prompt: 'dances' }, [], { record: approve.id, slot: 1 })
    const firstFrameProblem = 'Shot 2: Model video/ref2v/test/fake cannot generate this: It takes no first frame.'
    expect(await preview(fixture, 'p1')).toMatchObject({ rendered: 2, problems: [firstFrameProblem, nightProblem] })
    // A model that fails with a value other than an Error reports that value.
    fixture.checks.t2v = () => { throw 'the backend is down' }
    expect(await preview(fixture, 'p1')).toMatchObject({ problems: [firstFrameProblem, 'Shot 3: the backend is down'] })
  })

  it('refuses an unknown plan or version with invalid_params', async () => {
    const fixture = await start()
    await fixture.call('dv_plan_create', { reason: 'propose', shots: [{ ...TXT, prompt: 'A street' }] })
    const unknown = await fixture.call('dv_story_preview', { reason: 'show', plan: 'p9' })
    expect(unknown.isError ? unknown.error.message : '').toContain('Unknown plan \'p9\'')
    const run = (params: Record<string, unknown>): Promise<unknown> =>
      fixture.ctx.dvProject.run({ ...USER, project: fixture.project, operation: 'story.preview', params, inputs: [], intent: 'preview' })
    const unknownPlan = 'Unknown plan \'p9\'; pass the plan ID (p1, p2, …) that dv_plan_create reported.'
    await expect(run({ plan: 'p9' })).rejects.toMatchObject({ code: 'invalid_params', message: unknownPlan })
    await expect(run({ plan: 'p1', version: 9 })).rejects.toMatchObject({ code: 'invalid_params', message: 'Plan \'p1\' has no version 9; it has 1.' })
  })
})
