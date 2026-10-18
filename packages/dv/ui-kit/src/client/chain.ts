/**
 * The chain of a record: which record started it, at which position, and in which parallel sequence (`started_by`).
 * A canvas retake records only `based_on`, so it belongs to the chain of its `based_on` root.
 *
 * @module @dv/ui-kit/chain
 */
import type { ProjectRecord, WireStartedBy } from './types.ts'

/**
 * The chain of a record: its own `started_by`, else the `started_by` of its `based_on` root, else null. The walk stops
 * after as many steps as there are records, so a `based_on` cycle ends.
 * @param record - the record.
 * @param records - the loaded records by ID.
 * @returns the chain, or null when the record and its root have none.
 */
export function chainOf(record: ProjectRecord, records: ReadonlyMap<string, ProjectRecord>): WireStartedBy | null {
  let root = record
  for (let step = 0; step <= records.size && root.started_by === undefined && root.based_on !== null; step++) {
    const parent = records.get(root.based_on)
    if (parent === undefined) break
    root = parent
  }
  return root.started_by ?? null
}
