/** The chain of a record: its own `started_by`, else that of its `based_on` root. */
import { describe, expect, it } from 'vitest'
import { chainOf } from '../src/client/chain.ts'
import type { ProjectRecord } from '../src/client/types.ts'
import { record } from './fixture.client.tsx'

/**
 * Index records by ID.
 * @param records - the records.
 * @returns the records by ID.
 */
const byId = (...records: ProjectRecord[]): Map<string, ProjectRecord> => new Map(records.map(item => [item.id, item]))

describe('chainOf', () => {
  const render = record({ id: 'g1', started_by: { record: 'ap', slot: 1, lane: '9:16' } })
  const retake = record({ id: 'g2', based_on: 'g1' })
  const again = record({ id: 'g3', based_on: 'g2' })

  it('reads the record\'s own started_by', () => {
    expect(chainOf(render, byId(render))).toEqual({ record: 'ap', slot: 1, lane: '9:16' })
  })

  it('reads the started_by of the based_on root for a retake', () => {
    expect(chainOf(again, byId(render, retake, again))).toEqual({ record: 'ap', slot: 1, lane: '9:16' })
  })

  it('is null for a free record, a root that is not loaded, and a based_on cycle', () => {
    expect(chainOf(record({ id: 'free' }), byId())).toBeNull()
    expect(chainOf(retake, byId(retake))).toBeNull()
    const loopA = record({ id: 'a', based_on: 'b' })
    const loopB = record({ id: 'b', based_on: 'a' })
    expect(chainOf(loopA, byId(loopA, loopB))).toBeNull()
  })
})
