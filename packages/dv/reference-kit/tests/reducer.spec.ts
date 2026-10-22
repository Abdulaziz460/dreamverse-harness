/** The pure reducer of `defineReference`: versions from `<k>.create` and `<k>.update` records, `fields` values, and the agent summary. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AssetId, ProjectRecord, ProjectState, RecordId, RecordInput } from '@dv/project'
import { describe, expect, it } from 'vitest'
import { referenceReducer } from '../src/index.ts'
import { TEST_REF } from './support.ts'

const FACE = brandString<AssetId>('face')
const COAT = brandString<AssetId>('coat')
const reducer = referenceReducer(TEST_REF)

/**
 * A record of one operation.
 * @returns the record.
 */
function record(
  id: string, operation: string, params: Record<string, unknown>, references: AssetId[] = [], status: ProjectRecord['status'] = 'done',
): ProjectRecord {
  const inputs: RecordInput[] = references.map(asset => ({ role: 'reference', ref: { asset }, resolved_asset: asset }))
  return {
    id: brandString<RecordId>(id), parents: [], kind: 'operation', component: operation.split('.')[0] ?? '', operation,
    operation_version: '1', actor: 'user', surface: 'canvas', turn: null, session: null, tool_call: null, intent: '', params, inputs,
    outputs: [], based_on: null, supersedes: [], deterministic: false, status, created_at: '2026-10-20T00:00:00.000Z',
  }
}

describe('referenceReducer', () => {
  it('writes version 1 on create and the next version on each update; an update keeps what it leaves out, traits included', () => {
    const slice = [
      record('r1', 'test_ref.create', { test_ref: 'a', name: 'Lead', description: 'red' }, [FACE]),
      record('r2', 'test_ref.update', { test_ref: 'a', traits: ['tall'] }),
      record('r3', 'test_ref.update', { test_ref: 'a', name: 'Hero' }, [COAT]),
      record('r4', 'test_ref.create', { test_ref: 'b', name: 'Other', traits: ['calm'] }),
      record('r5', 'test_ref.update', { test_ref: 'b', name: 'Lost' }, [], 'failed'),
      record('r6', 'test_ref2.create', { test_ref2: 'c', name: 'Foreign' }),
    ].reduce((current, entry) => reducer.reduce(current, entry), reducer.initial())
    expect(slice).toEqual({
      a: [
        { id: 'a', version: 1, name: 'Lead', description: 'red', references: [FACE], traits: [], created_by: 'r1' },
        { id: 'a', version: 2, name: 'Lead', description: 'red', references: [FACE], traits: ['tall'], created_by: 'r2' },
        { id: 'a', version: 3, name: 'Hero', description: 'red', references: [COAT], traits: ['tall'], created_by: 'r3' },
      ],
      b: [{ id: 'b', version: 1, name: 'Other', description: '', references: [], traits: ['calm'], created_by: 'r4' }],
    })
  })

  it('lists the latest version of each ID with its traits under the plural of the key', () => {
    const slice = [
      record('r1', 'test_ref.create', { test_ref: 'a', name: 'Lead' }, [FACE]),
      record('r2', 'test_ref.update', { test_ref: 'a', description: 'blue', traits: ['tall'] }),
    ].reduce((current, entry) => reducer.reduce(current, entry), reducer.initial())
    const summary = reducer.agentSummary?.(slice, { url: asset => `https://assets.example/${asset}` }, {} as ProjectState)
    expect(summary).toEqual({ test_refs: [{ id: 'a', version: 2, name: 'Lead', description: 'blue', references: [FACE], traits: ['tall'] }] })
  })
})
