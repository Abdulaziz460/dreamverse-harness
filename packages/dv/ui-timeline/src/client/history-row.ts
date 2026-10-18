/**
 * The History row of timeline records, as the History panel reads it through `dvHistory.rows`: no subject, and a focus
 * that opens the record's timeline in the timeline editor and selects its clip.
 */
import type { HistoryRow } from '@dv/ui-kit/registries.ts'
import type { ProjectRecord } from '@dv/ui-kit/types.ts'

/** @returns the text value of a param, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** @returns the clip IDs a finished record assigned (`report.clips`). */
function reportedClips(record: ProjectRecord): string[] {
  const clips = record.report?.['clips']
  return Array.isArray(clips) ? clips.filter((clip): clip is string => typeof clip === 'string') : []
}

/**
 * The timeline each clip belongs to: the timeline of the record that assigned the clip (`timeline.create`, `update`,
 * `clip_insert` name it by `params.timeline`, a create without one makes `t1`; `clip_split` adds to the timeline of the
 * split clip).
 * @param records - the records of the current state, oldest first.
 * @returns clip ID → timeline ID.
 */
export function clipTimelines(records: readonly ProjectRecord[]): Map<string, string> {
  const owner = new Map<string, string>()
  for (const record of records) {
    const clips = reportedClips(record)
    if (clips.length === 0) continue
    const timeline = record.operation === 'timeline.clip_split'
      ? owner.get(text(record.params['clip']) ?? '') ?? null
      : text(record.params['timeline']) ?? (record.operation === 'timeline.create' ? 't1' : null)
    if (timeline === null) continue
    for (const clip of clips) owner.set(clip, timeline)
  }
  return owner
}

/**
 * The timeline a record works on: its `timeline` param, else the timeline of its `clip` param, else `t1` for a
 * `timeline.create` without a param.
 * @param record - the record.
 * @param owner - clip ID → timeline ID, from {@link clipTimelines}.
 * @returns the timeline ID, or null when the record names none.
 */
function timelineOf(record: ProjectRecord, owner: ReadonlyMap<string, string>): string | null {
  const named = text(record.params['timeline'])
  if (named !== null) return named
  const clip = text(record.params['clip'])
  if (clip !== null) return owner.get(clip) ?? null
  return record.operation === 'timeline.create' ? 't1' : null
}

/**
 * The History row of every `timeline.*` operation. It adds no subject to the operation label. Its focus opens the
 * record's timeline and selects the record's `clip` param, else the first clip the record assigned; a record whose
 * timeline cannot be found focuses nothing.
 */
export const timelineHistoryRow: HistoryRow = {
  match: 'timeline.',
  subject: () => null,
  focus(record, records) {
    const timelineId = timelineOf(record, clipTimelines(records))
    if (timelineId === null) return null
    const clipId = text(record.params['clip']) ?? reportedClips(record)[0] ?? null
    return { event: 'dv:timeline-focus', detail: { timelineId, clipId } }
  },
}
