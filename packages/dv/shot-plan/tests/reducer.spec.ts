/** The pure `plan` reducer: plan versions, the agent summary, and records it ignores. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ProjectRecord, ProjectState, RecordId } from '@dv/project'
import { describe, expect, it } from 'vitest'
import { planReducer } from '../src/reducer.ts'
import type { Shot } from '../src/types.ts'

let counter = 0

/** A finished record of one operation with the given fields. */
function record(operation: string | null, params: Record<string, unknown> = {}, fields: Partial<ProjectRecord> = {}): ProjectRecord {
  counter += 1
  return {
    id: brandString<RecordId>(`record-${counter}`), parents: [], kind: 'operation', component: 'plan', operation,
    operation_version: '1', actor: 'user', surface: 'api', turn: null, session: null, tool_call: null, intent: 'x', params, inputs: [],
    outputs: [], based_on: null, supersedes: [], deterministic: true, status: 'done', created_at: new Date().toISOString(), ...fields,
  }
}

/** A shot of the model `fake` of provider `test` in task `t2v` with the given prompt. */
function shot(prompt: string): Shot {
  return { modality: 'video', task: 't2v', provider: 'test', model: 'fake', prompt }
}

/** Reduce records in order from the initial slice. */
function reduceAll(records: ProjectRecord[]) {
  return records.reduce((slice, next) => planReducer.reduce(slice, next), planReducer.initial())
}

describe('plan reducer', () => {
  it('adds version 1 at plan.create and the next version at plan.update', () => {
    const failed = record('plan.create', { shots: [] }, { status: 'failed' })
    const created = record('plan.create', { title: 't', shots: [shot('a')] }, { report: { plan: 'p1', version: 1 } })
    const revised = record('plan.update', { plan: 'p1', shots: [shot('b')] }, { report: { plan: 'p1', version: 2 } })
    const running = record('plan.update', { plan: 'p1', shots: [shot('c')] }, { status: 'running' })
    const v1 = { title: 't', shots: [shot('a')], version: 1, created_by: created.id }
    const v2 = { shots: [shot('b')], version: 2, created_by: revised.id }
    expect(reduceAll([failed, created, revised, running]).plans).toEqual({ p1: [v1, v2] })
  })

  it('ignores other operations\' records, unknown plans, and creates without a plan ID', () => {
    const created = record('plan.create', { shots: [shot('a')] }, { report: { plan: 'p1', version: 1 } })
    const slice = reduceAll([created])
    expect(planReducer.reduce(slice, record('timeline.create', { plan: 'p1' }, { component: 'timeline' }))).toBe(slice)
    // A plan.approve record of an old log changes nothing.
    expect(planReducer.reduce(slice, record('plan.approve', { plan: 'p1', version: 1 }))).toBe(slice)
    expect(planReducer.reduce(slice, record('plan.update', { plan: 'p9', shots: [shot('b')] }))).toBe(slice)
    expect(planReducer.reduce(slice, record('plan.create', { shots: [shot('b')] }))).toBe(slice)
    expect(planReducer.reduce(slice, record('plan.create', { shots: [] }, { report: { plan: 'p1', version: 1 } }))).toBe(slice)
  })

  it('lists each plan once in the agent summary with its latest version and shot count', () => {
    const created = record('plan.create', { title: 'dance', shots: [shot('a')] }, { report: { plan: 'p1', version: 1 } })
    const revised = record('plan.update', { plan: 'p1', title: 'dance', shots: [shot('a'), shot('b')] })
    const other = record('plan.create', { shots: [shot('c')] }, { report: { plan: 'p2', version: 1 } })
    const slice = reduceAll([created, revised, other])
    expect(planReducer.agentSummary?.(slice, { url: asset => asset }, {} as ProjectState)).toEqual({
      plans: [
        { plan: 'p1', title: 'dance', version: 2, shots: 2 },
        { plan: 'p2', title: null, version: 1, shots: 1 },
      ],
    })
  })
})
