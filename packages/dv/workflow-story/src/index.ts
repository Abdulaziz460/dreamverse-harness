/**
 * The story workflow of DreamVerse as the `dvStory` Cordis service: it turns a version of a shot plan into renders of
 * its shots. It owns the read `story.preview` (tool `dv_story_preview`), which reports what approving a plan version
 * renders and why a render would be refused, without writing. The shots come from `dvShotPlan.shots`, the shot walk of
 * `@dv/workflow-kit` picks the take each shot reuses, and `dvShotRender` estimates and checks each shot that renders.
 *
 * @module @dv/workflow-story
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ProjectError, type OperationResult, type OperationSpec, type ProjectState } from '@dv/project'
import type { PlanVersion } from '@dv/shot-plan'
import type {} from '@dv/shot-render'
import { checkShots, planShots, shotLine, takeFilter, walkShot, type Owns, type WalkStep } from '@dv/workflow-kit'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The story workflow: what approving a plan version renders. */
    dvStory: DvStory
  }
}

/** `dvStory` plugin configuration: the workflow has no deployment-varying values. */
export type Config = Record<string, unknown>

/** Loader validation. */
export const Config: z<Config> = z.object({})

/** The params of a story call: the plan, and the version, the latest when omitted. */
interface StoryParams {
  plan: string
  version?: number
}

/** What approving a plan version renders: one line per shot, the number of shots that render, and their GPU estimate. */
interface StoryPreview {
  version: number
  shots: string[]
  rendered: number
  gpu_seconds: number
}

/** The story params of a call's params, which the runner validated against the operation's schema. */
function storyParams(params: Record<string, unknown>): StoryParams {
  const { plan, version } = params
  return { plan: String(plan), ...typeof version === 'number' ? { version } : {} }
}

/**
 * The starter records that belong to the story workflow for a plan: its `story.approve` records of that plan. Take
 * reuse tests the starter of a take's chain with it, so a free take, a take of another plan and an ad take are never
 * reused.
 * @param plan - the PlanId.
 * @returns the test of a starter record.
 */
function ownsPlan(plan: string): Owns {
  return starter => starter.operation === 'story.approve' && starter.params['plan'] === plan
}

/** The story workflow service: `story.preview` and the plan walk it reads. */
export default class DvStory extends Service {
  static inject = ['dvProject', 'dvShotPlan', 'dvShotRender', 'dvTimeline']
  static Config = Config

  constructor(ctx: Context, _config: Config) {
    super(ctx, 'dvStory')
    ctx.effect(() => ctx.dvProject.registerComponent('story'), 'dvStory component')
    ctx.effect(() => ctx.dvProject.registerOperation(this.previewOperation()), 'dvStory story.preview')
  }

  /**
   * One version of a plan, read through `dvShotPlan.get`.
   * @param state - the state the plan is read in.
   * @param params - the plan and version.
   * @returns the version.
   * @throws ProjectError `invalid_params` naming an unknown plan or version.
   */
  private version(state: ProjectState, params: StoryParams): PlanVersion {
    try {
      return this.ctx.dvShotPlan.get(state, params.plan, params.version)
    } catch (error) {
      /* v8 ignore next -- `dvShotPlan.get` throws only Error objects. */
      throw new ProjectError('invalid_params', error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * The shots of a plan version as the shot walk reads them: each shot's parsed references and the take it reuses.
   * A take is reused only when its chain starter is a `story.approve` record of the plan.
   * @param state - the state the plan and the takes are read in.
   * @param params - the plan and version.
   * @returns the version and the walk steps, in shot order.
   * @throws ProjectError `invalid_params` naming an unknown plan or version; the error of `parseInputs` for a reference
   *   that does not parse.
   */
  private walk(state: ProjectState, params: StoryParams): { version: PlanVersion; steps: WalkStep[] } {
    const version = this.version(state, params)
    const shots = this.ctx.dvShotPlan.shots(state, params.plan, version.version).map(resolved => walkShot(resolved))
    return { version, steps: planShots(this.ctx.dvShotRender, state, shots, takeFilter(state, ownsPlan(params.plan))) }
  }

  /**
   * What approving a plan version renders, without writing: one `shotLine` per shot, the number of shots that render,
   * and the sum of `dvShotRender.estimate` over them. Synchronous, so a confirm summary can call it.
   * @param state - the state the approval would run on.
   * @param params - the plan and version.
   * @returns the preview.
   * @throws ProjectError `invalid_params` naming an unknown plan or version.
   */
  private previewLines(state: ProjectState, params: StoryParams): StoryPreview {
    const { version, steps } = this.walk(state, params)
    const rendering = steps.filter(step => step.reuse === null)
    const shots = steps.map((step, index) => {
      const shot = version.shots[index]
      /* v8 ignore next -- `planShots` returns one step per shot of the version, in shot order. */
      if (shot === undefined) throw new Error(`Plan '${params.plan}' v${String(version.version)} has no shot ${String(step.slot)}.`)
      return shotLine(step, shot)
    })
    const gpuSeconds = rendering.reduce((sum, step) => sum + this.ctx.dvShotRender.estimate(step).gpu_seconds, 0)
    return { version: version.version, shots, rendered: rendering.length, gpu_seconds: gpuSeconds }
  }

  /**
   * Every reason an approval of a plan version would be refused, as `Shot <n>: <reason>`: `checkShots` of the shots
   * that render.
   * @param state - the state the approval would run on.
   * @param params - the plan and version.
   * @returns the problems, empty when every render would run.
   * @throws ProjectError `invalid_params` naming an unknown plan or version.
   */
  private async problems(state: ProjectState, params: StoryParams): Promise<string[]> {
    const { steps } = this.walk(state, params)
    const refusals = await checkShots(this.ctx.dvShotRender, state, steps)
    return refusals.map(({ slot, reason }) => `Shot ${String(slot)}: ${reason}`)
  }

  /**
   * The `story.preview` operation.
   * @returns the operation.
   */
  private previewOperation(): OperationSpec {
    return {
      name: 'story.preview',
      component: 'story',
      version: '1',
      label: { zh: '预览分镜计划', en: 'Preview plan' },
      description: 'Preview what approving a plan version renders, without rendering: shots has one line per shot (a new or changed '
        + 'shot renders; an unchanged shot keeps its take), rendered counts the shots that render, gpu_seconds is their GPU estimate, '
        + 'and problems lists why a render would be refused. Show the lines and gpu_seconds to the user. When problems is not empty, '
        + 'update the plan with dv_plan_update and preview again.',
      inputs: {},
      params: {
        plan: { type: 'string', required: true, description: 'The plan ID (p1, p2, …).' },
        version: { type: 'integer', description: 'The version to preview; defaults to the latest.' },
      },
      outputs: [],
      deterministic: false,
      resource: 'none',
      confirm: 'never',
      readOnly: true,
      summarize: () => 'story preview',
      execute: async (context): Promise<OperationResult> => {
        const params = storyParams(context.params)
        const preview = this.previewLines(context.state, params)
        const problems = await this.problems(context.state, params)
        return { outputs: [], report: { plan: params.plan, ...preview, problems } }
      },
    }
  }
}
