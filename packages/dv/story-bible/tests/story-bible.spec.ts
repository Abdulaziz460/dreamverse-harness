/**
 * The Story bible component in a REAL composition: a test-only `cordis.yml` boots the DSH skill and tool registries,
 * `dvProject`, `dvFfmpeg`, the asset pool and `dvStoryBible` through the Loader. The agent's `dv_bible_*` calls write versions,
 * `<id>@<version>` inputs resolve to the version's reference images, and an update makes the records that read the
 * previous version stale. The only fake is a test `shot.render` that stands for the generation backend.
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
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import DvAssetPool from '@dv/asset-pool'
import DvFfmpeg from '@dv/ffmpeg'
import DvProject, {
  type AssetId, type OperationToolValue, type ProjectId, type ProjectRecord, type RecordId, type RecordOrigin, type SessionId,
} from '@dv/project'
import { afterEach, describe, expect, it } from 'vitest'
import DvStoryBible, { type CharacterId } from '../src/index.ts'

/** The plugin classes the fixture rows resolve through `globalThis`, because Node imports the rows outside Vite. */
const PLUGINS = { SkillRegistry, SystemPrompt, ToolRuntime, DvProject, DvFfmpeg, DvAssetPool, DvStoryBible }

/** The six operations, in registration order. */
const OPERATIONS = [
  'bible.character_create', 'bible.character_update', 'bible.location_create', 'bible.location_update', 'bible.style_create',
  'bible.style_update',
]

/** A human edit on `main`, outside any chat session. */
const HUMAN: RecordOrigin = { actor: 'user', surface: 'canvas', session: null, turn: null, tool_call: null, intent: 'edit' }

interface Fixture {
  ctx: Context
  project: ProjectId
  /** Store bytes in the asset pool. */
  put(text: string): AssetId
  /** Run one tool as the agent of chat session `s1`, which is bound to `project`. */
  call(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult>
}

const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

/**
 * Boot the composition from a test-only `cordis.yml`, and register a test `shot.render` whose `reference` input takes
 * character, location and style versions.
 * @returns the fixture, with a project bound to chat session `s1`.
 */
async function start(): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), 'dv-story-bible-'))
  const globals = globalThis as typeof globalThis & { __dvStoryBibleComposition?: typeof PLUGINS }
  globals.__dvStoryBibleComposition = PLUGINS
  const rows: string[] = []
  const row = (id: string, key: keyof typeof PLUGINS, config: string[]): void => {
    writeFileSync(join(dir, `${id}.mjs`), `export default globalThis.__dvStoryBibleComposition.${key}\n`)
    rows.push(`- id: ${id}`, `  name: ${pathToFileURL(join(dir, `${id}.mjs`)).href}`, ...config.length === 0 ? [] : ['  config:', ...config.map(line => `    ${line}`)])
  }
  row('skills', 'SkillRegistry', [])
  row('system-prompt', 'SystemPrompt', [])
  row('tools', 'ToolRuntime', [])
  row('dv-project', 'DvProject', [`root: ${join(dir, 'projects')}`, `sessionRoot: ${join(dir, 'sessions')}`])
  row('dv-ffmpeg', 'DvFfmpeg', ['ffmpegPath: ffmpeg', 'ffprobePath: ffprobe'])
  row('dv-asset-pool', 'DvAssetPool', [`root: ${join(dir, 'assets')}`])
  row('dv-story-bible', 'DvStoryBible', [])
  writeFileSync(join(dir, 'cordis.yml'), `${rows.join('\n')}\n`)

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
  await ctx.loader.await()
  disposers.push(async () => {
    await ctx.fiber.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  ctx.dvProject.registerComponent('shot')
  ctx.dvProject.registerOperation({
    name: 'shot.render', component: 'shot', version: '1', description: 'Test render.', params: {},
    inputs: { reference: { type: 'image', many: true, versioned: true, description: 'References.' } },
    outputs: [], deterministic: false, resource: 'none', confirm: 'never', summarize: () => 'rendered',
    execute: () => Promise.resolve({ outputs: [] }),
  })
  const project = (await ctx.dvProject.createProject('bible', HUMAN)).id
  ctx.dvProject.bindSession(brandString<SessionId>('s1'), project)
  let calls = 0
  return {
    ctx, project,
    put: text => ctx.dvAssetPool.importAsset(Buffer.from(text), { mime: 'image/png', name: `${text}.png` }, null),
    call(name, args) {
      calls += 1
      return ctx.tools.execute({ callId: ToolCallId(`call-${calls}`), name, arguments: args, signal: new AbortController().signal, agent: { id: 's1' } as never })
    },
  }
}

/** The `test_prop` slice: the record that wrote each version of a test prop, oldest first, by ID. */
type TestPropSlice = Record<string, RecordId[]>

/**
 * Register a test-only reference kind `test_prop` with `string` IDs, owned by the component `test_prop`, and its create
 * `test_prop.create`, which refuses an ID that `kindsWithId` lists, as a kind owner's create does.
 * @param project - the `dvProject` service.
 */
function registerTestProp(project: Context['dvProject']): void {
  project.registerComponent('test_prop')
  project.registerReducer('test_prop' as never, {
    initial: (): TestPropSlice => ({}),
    reduce: (slice: TestPropSlice, record: ProjectRecord): TestPropSlice => (
      record.operation === 'test_prop.create' && record.status === 'done' ? { ...slice, [String(record.params['id'])]: [record.id] } : slice),
  } as never)
  project.registerReferenceKind({
    kind: 'test_prop', component: 'test_prop' as never, assetsOf: () => [],
    createdBy: (slice: TestPropSlice, id, version) => slice[id]?.[version - 1] ?? null,
    latest: (slice: TestPropSlice, id) => slice[id]?.length ?? null,
  })
  project.registerOperation({
    name: 'test_prop.create', component: 'test_prop', version: '1', description: 'Test prop create.',
    params: { id: { type: 'string', required: true, description: 'The ID.' } }, inputs: {},
    outputs: [], deterministic: false, resource: 'none', confirm: 'never', summarize: () => 'test prop created',
    execute(context) {
      const used = project.kindsWithId(context.state, String(context.params['id']))
      if (used.length > 0) throw new Error(`The ID already names a ${used.join(', ')}.`)
      return Promise.resolve({ outputs: [] })
    },
  })
}

/** The value of a successful operation tool call. */
function value(result: ToolExecutionResult): OperationToolValue {
  if (result.isError) throw new Error(result.error.message)
  return result.value as OperationToolValue
}

/** The error message of a failed tool call. */
function failure(result: ToolExecutionResult): string {
  return result.isError ? result.error.message : ''
}

describe('dvStoryBible', () => {
  it('registers six operations with their dv_bible_* tools and the reducer, and removes them on disposal', async () => {
    const fixture = await start()
    const specs = fixture.ctx.dvProject.listOperations().filter(spec => spec.component === 'bible')
    expect(specs.map(spec => spec.name)).toEqual(OPERATIONS)
    for (const name of OPERATIONS) expect(fixture.ctx.tools.get(`dv_${name.replace('.', '_')}`)).toBeDefined()
    expect(fixture.ctx.dvProject.getState(fixture.project).components.bible).toEqual({ characters: {}, locations: {}, styles: {} })
    const entry = [...fixture.ctx.loader.entries()].find(candidate => candidate.options.name.endsWith('/dv-story-bible.mjs'))
    await entry?.fiber?.dispose()
    expect(fixture.ctx.dvProject.listOperations().filter(spec => spec.component === 'bible')).toEqual([])
    expect(fixture.ctx.tools.get('dv_bible_character_create')).toBeUndefined()
    expect(fixture.ctx.dvProject.getState(fixture.project).components).not.toHaveProperty('bible')
  })

  it('registers the story-bible skill while dvStoryBible is mounted, and removes it on disposal', async () => {
    const fixture = await start()
    const skill = await fixture.ctx.skills.get('story-bible')
    expect(skill).toMatchObject({ name: 'story-bible', source: 'runtime', invocation: { modelInvocable: true } })
    expect(skill?.content.startsWith('# Story bible\n')).toBe(true)
    expect(skill?.content).toContain('`dv_bible_character_create` for every person who must stay the same across shots')
    const entry = [...fixture.ctx.loader.entries()].find(candidate => candidate.options.name.endsWith('/dv-story-bible.mjs'))
    await entry?.fiber?.dispose()
    expect(await fixture.ctx.skills.get('story-bible')).toBeUndefined()
  })

  it('creates a character from the agent tool and resolves <id>@1 to its reference images', async () => {
    const fixture = await start()
    const face = fixture.put('face')
    const created = value(await fixture.call('dv_bible_character_create', {
      reason: 'register the lead', character: 'c1', name: 'Lead', description: 'red coat', inputs: { reference: [face] },
    }))
    expect(created).toMatchObject({ status: 'done', summary: 'character Lead created', outputs: [], params: { character: 'c1', name: 'Lead' } })
    const state = fixture.ctx.dvProject.getState(fixture.project)
    const record = state.components.proj.records.find(entry => entry.operation === 'bible.character_create')
    expect(record).toMatchObject({
      actor: 'agent', surface: 'chat', component: 'bible', params: { character: 'c1', name: 'Lead', description: 'red coat' },
      inputs: [{ role: 'reference', ref: { asset: face }, resolved_asset: face }], outputs: [], deterministic: false,
    })
    expect(state.components.bible.characters).toEqual({
      c1: [{ id: 'c1', version: 1, name: 'Lead', description: 'red coat', references: [face], created_by: record?.id }],
    })
    const ref = { character: brandString<CharacterId>('c1'), version: 1 }
    expect(fixture.ctx.dvProject.assetsOf(state, ref)).toEqual([face])
    expect(fixture.ctx.dvProject.parseInputs('shot.render', { reference: ['c1@1'] }, state)).toEqual([{ role: 'reference', ref }])
    value(await fixture.call('dv_shot_render', { reason: 'shoot', inputs: { reference: ['c1@1'] } }))
    const render = fixture.ctx.dvProject.getState(fixture.project).components.proj.records.at(-1)
    expect(render?.inputs).toEqual([{ role: 'reference', ref, resolved_asset: face }])
  })

  it('updates to the next version, keeps what the call leaves out, and marks what read the old version stale', async () => {
    const fixture = await start()
    const face = fixture.put('face')
    const coat = fixture.put('coat')
    value(await fixture.call('dv_bible_location_create', { reason: 'beach', location: 'l1', name: 'Beach', inputs: { reference: [face] } }))
    const render = value(await fixture.call('dv_shot_render', { reason: 'shoot', inputs: { reference: ['l1@1'] } }))
    const renamed = value(await fixture.call('dv_bible_location_update', { reason: 'rename', location: 'l1', name: 'Shore' }))
    expect(renamed.summary).toBe('location l1 updated')
    const restyled = value(await fixture.call('dv_bible_location_update', { reason: 'new reference image', location: 'l1', inputs: { reference: [coat] } }))
    const state = fixture.ctx.dvProject.getState(fixture.project)
    expect(state.components.bible.locations['l1' as never]?.map(version => [version.version, version.name, version.references]))
      .toEqual([[1, 'Beach', [face]], [2, 'Shore', [face]], [3, 'Shore', [coat]]])
    const records = state.components.proj.records
    const first = records.find(entry => entry.operation === 'bible.location_create')
    expect(records.find(entry => entry.id === renamed.record)?.supersedes).toEqual([first?.id])
    expect(records.find(entry => entry.id === restyled.record)?.supersedes).toEqual([renamed.record])
    expect(state.components.proj.stale).toEqual({ [render.record]: renamed.record })
  })

  it('refuses a used ID, an unknown ID, an ID with @, and invalid params', async () => {
    const fixture = await start()
    value(await fixture.call('dv_bible_style_create', { reason: 'film', style: 's1', name: 'Film' }))
    expect(failure(await fixture.call('dv_bible_character_create', { reason: 'clash', character: 's1', name: 'X' })))
      .toBe("The ID 's1' already names a style; update it, or choose another ID.")
    expect(failure(await fixture.call('dv_bible_character_update', { reason: 'unknown', character: 's1', name: 'X' })))
      .toBe("Unknown character 's1'.")
    expect(failure(await fixture.call('dv_bible_character_create', { reason: 'bad', character: 'c@1', name: 'X' })))
      .toBe("The character ID 'c@1' must be non-empty and contain no @ or #.")
    const before = fixture.ctx.dvProject.listHistory({ project: fixture.project }).length
    await expect(fixture.ctx.dvProject.run({
      ...HUMAN, project: fixture.project, operation: 'bible.character_create', params: { character: 'c1' }, inputs: [],
    })).rejects.toMatchObject({ code: 'invalid_params' })
    expect(fixture.ctx.dvProject.listHistory({ project: fixture.project })).toHaveLength(before)
    const failed = fixture.ctx.dvProject.getState(fixture.project).components.proj.records
      .filter(record => record.status === 'failed').map(record => record.error?.code)
    expect(failed).toEqual(['operation_failed', 'operation_failed', 'operation_failed'])
    expect(Object.keys(fixture.ctx.dvProject.getState(fixture.project).components.bible.characters)).toEqual([])
  })

  it('refuses a character whose ID a test_prop has', async () => {
    const fixture = await start()
    registerTestProp(fixture.ctx.dvProject)
    const prop = await fixture.ctx.dvProject.run({ ...HUMAN, project: fixture.project, operation: 'test_prop.create', params: { id: 'p1' }, inputs: [] })
    expect(prop.record?.status).toBe('done')
    expect(fixture.ctx.dvProject.kindsWithId(fixture.ctx.dvProject.getState(fixture.project), 'p1')).toEqual(['test_prop'])
    expect(failure(await fixture.call('dv_bible_character_create', { reason: 'clash', character: 'p1', name: 'X' })))
      .toBe("The ID 'p1' already names a test_prop; update it, or choose another ID.")
    expect(fixture.ctx.dvProject.getState(fixture.project).components.bible.characters).toEqual({})
  })

  it('gives the ID of a character to kindsWithId, so a test_prop with that ID is refused', async () => {
    const fixture = await start()
    registerTestProp(fixture.ctx.dvProject)
    value(await fixture.call('dv_bible_character_create', { reason: 'lead', character: 'c1', name: 'Lead' }))
    value(await fixture.call('dv_bible_character_update', { reason: 'rename', character: 'c1', name: 'Hero' }))
    const state = fixture.ctx.dvProject.getState(fixture.project)
    expect(fixture.ctx.dvProject.kindsWithId(state, 'c1')).toEqual(['character'])
    expect(fixture.ctx.dvProject.latestVersion(state, 'character', 'c1')).toBe(2)
    const prop = await fixture.ctx.dvProject.run({ ...HUMAN, project: fixture.project, operation: 'test_prop.create', params: { id: 'c1' }, inputs: [] })
    expect(prop.record).toMatchObject({ status: 'failed', error: { code: 'operation_failed', message: 'The ID already names a character.' } })
    expect(fixture.ctx.dvProject.kindsWithId(fixture.ctx.dvProject.getState(fixture.project), 'c1')).toEqual(['character'])
  })

  it('takes a version an undo took back off the state, and frees its ID there', async () => {
    const fixture = await start()
    const lead = fixture.put('lead')
    const created = value(await fixture.call('dv_bible_character_create', {
      reason: 'lead', character: 'c1', name: 'Lead', inputs: { reference: [lead] },
    }))
    const bible = () => fixture.ctx.dvProject.getState(fixture.project).components.bible
    expect(Object.keys(bible().characters)).toEqual(['c1'])
    await fixture.ctx.dvProject.undo(fixture.project)
    // After the undo the ID c1 is free again, so a location may take it.
    await fixture.ctx.dvProject.run({
      ...HUMAN, project: fixture.project, operation: 'bible.location_create', params: { location: 'c1', name: 'Cave' }, inputs: [],
    })
    expect([Object.keys(bible().characters), Object.keys(bible().locations)]).toEqual([[], ['c1']])
    // The new step discarded the character's step: it leaves the history and stays on disk.
    expect(fixture.ctx.dvProject.listHistory({ project: fixture.project, operation: 'bible.character_create' })).toEqual([])
    expect(fixture.ctx.dvProject.listRecords(fixture.project).map(record => record.id)).toContain(created.record)
  })
})
