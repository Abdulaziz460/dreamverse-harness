/**
 * The History panel's pure readings: action rows and the folds of started records, labels with subjects, thumbnails,
 * relative times, and the focus a selected step gives the canvas or the timeline.
 */
import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '@dv/ui-kit/registries.ts'
import type { HistoryEntry, ProjectRecord, WireOperation } from '@dv/ui-kit/types.ts'
import { asset, fixtureState, record } from '../../ui-kit/tests/fixture.client.tsx'
import {
  actionLabel, actionRows, centerFocus, clipTimelines, relativeTime, thumbnailOf, type LabelContext,
} from '../src/client/rows.ts'

/** An entry of a record, at or before the current position unless `place` says otherwise. */
const entry = (fields: Partial<ProjectRecord> & { id: string }, place: HistoryEntry['place'] = 'before'): HistoryEntry => ({ record: record(fields), place })

/**
 * What a label reads, with no operations on the wire unless given.
 * @param changes - the fields that differ from no operations, no registered rows and no records.
 * @returns the label context.
 */
const labels = (changes: Partial<LabelContext> = {}): LabelContext => ({ operations: [], rows: [], records: new Map(), ...changes })

describe('actionRows', () => {
  it('folds the loaded records a record started under its row, in log order', () => {
    const rows = actionRows([
      entry({ id: 'tl', actor: 'system', operation: 'timeline.update', started_by: { record: 'ap', slot: null } }),
      entry({ id: 'g2', actor: 'system', operation: 'shot.render', started_by: { record: 'ap', slot: 2 } }),
      entry({ id: 'g1', actor: 'system', operation: 'shot.render', started_by: { record: 'ap', slot: 1 } }),
      entry({ id: 'ap', turn: 't2', operation: 'story.approve', report: { plan: 'p1', version: 2 } }),
      entry({ id: 'h1', operation: 'timeline.clip_move' }),
    ])
    expect(rows.map(row => [row.entry.record.id, row.children.map(child => child.record.id)])).toEqual([
      ['ap', ['g1', 'g2', 'tl']], ['h1', []],
    ])
  })

  it('keeps started records as rows of their own while their starter is not loaded', () => {
    const render = entry({ id: 'g1', actor: 'system', operation: 'shot.render', started_by: { record: 'ap', slot: 1 } })
    expect(actionRows([render]).map(row => row.entry.record.id)).toEqual(['g1'])
  })
})

describe('labels, thumbnails and times', () => {
  it('names the subject of plan and story bible actions', () => {
    expect(actionLabel(record({ id: 'a', operation: 'plan.create', params: { title: '猫' }, report: { plan: 'p1', version: 1 } }), labels()))
      .toEqual(['新建分镜计划《猫》', 'Create plan “猫”'])
    expect(actionLabel(record({ id: 'b', operation: 'plan.create', params: {}, report: { plan: 'p1', version: 1 } }), labels()))
      .toEqual(['新建分镜计划 p1', 'Create plan p1'])
    expect(actionLabel(record({ id: 'c', operation: 'plan.update', params: { plan: 'p1' }, report: { plan: 'p1', version: 2 } }), labels()))
      .toEqual(['修改分镜计划 p1 → v2', 'Update plan p1 → v2'])
    // A workflow's registered row names the subject of its approval; a plan.approve record of an old log has none.
    expect(actionLabel(record({ id: 'd', operation: 'plan.approve', params: { plan: 'p1' }, report: { plan: 'p1', version: 2 } }), labels()))
      .toEqual(['批准分镜计划', 'Approve plan'])
    expect(actionLabel(record({ id: 'tc', operation: 'timeline.create', params: { timeline: 't2' } }), labels())).toEqual(['新建时间线', 'Create timeline'])
    expect(actionLabel(record({ id: 'tu', operation: 'timeline.update', params: { timeline: 't2' } }), labels())).toEqual(['修改时间线', 'Update timeline'])
    expect(actionLabel(record({ id: 'g', component: 'bible', operation: 'bible.character_create', params: { character: 'c1', name: '阿明' } }), labels()))
      .toEqual(['新建角色「阿明」', 'Create character “阿明”'])
  })

  it('names the chain slot and lane of a started record and of its retakes, and nothing for a free record', () => {
    const render = record({ id: 'g1', operation: 'shot.render', params: { shot: 7 }, started_by: { record: 'ap', slot: 1 } })
    const variant = record({ id: 'g2', operation: 'shot.render', started_by: { record: 'ad', slot: 1, lane: '9:16' } })
    const retake = record({ id: 'g3', operation: 'shot.render', params: { shot: 1 }, based_on: 'g2' })
    const records = new Map([render, variant, retake].map(item => [item.id, item]))
    expect(actionLabel(render, labels({ records }))).toEqual(['渲染镜头 1', 'Render shot 1'])
    expect(actionLabel(variant, labels({ records }))).toEqual(['渲染镜头 1 · 9:16', 'Render shot 1 · 9:16'])
    expect(actionLabel(retake, labels({ records }))).toEqual(['渲染镜头 1 · 9:16', 'Render shot 1 · 9:16'])
    expect(actionLabel(record({ id: 'f', operation: 'shot.render', params: { shot: 7 } }), labels())).toEqual(['渲染镜头', 'Render shot'])
    expect(actionLabel(record({ id: 'tl', operation: 'timeline.create', started_by: { record: 'ap', slot: null } }), labels()))
      .toEqual(['新建时间线', 'Create timeline'])
  })

  it('takes the subject from the registered row of the operation, then from the row of its component key', () => {
    const rows: HistoryRow[] = [
      { match: 'timeline.', subject: () => [' 全部', ' all'] },
      { match: 'timeline.create', subject: () => [' t2', ' t2'] },
      { match: 'plan.update', subject: () => null },
    ]
    expect(actionLabel(record({ id: 'tc', operation: 'timeline.create', params: { timeline: 't2' } }), labels({ rows })))
      .toEqual(['新建时间线 t2', 'Create timeline t2'])
    expect(actionLabel(record({ id: 'tu', operation: 'timeline.update' }), labels({ rows }))).toEqual(['修改时间线 全部', 'Update timeline all'])
    expect(actionLabel(record({ id: 'c', operation: 'plan.update', params: { plan: 'p1' }, report: { plan: 'p1', version: 2 } }), labels({ rows })))
      .toEqual(['修改分镜计划', 'Update plan'])
  })

  it('shows an image first, a take\'s still for its video, a video frame without a still, and nothing for other files', () => {
    const assets = new Map([
      asset('take.mp4', 'video/mp4', 'g1'), asset('still.png', 'image/png', 'g1'), asset('clip.mp4', 'video/mp4', 'gone'),
      asset('plan.json', 'application/json', 'p'), asset('ref.png', 'image/png', null),
    ].map(item => [item.id, item]))
    const render = record({ id: 'g1', outputs: ['take.mp4', 'still.png'] })
    const records = new Map([[render.id, render]])
    expect(thumbnailOf(render, assets, records)).toEqual({ asset: 'still.png', kind: 'image' })
    const clipRow = record({ id: 'm', inputs: [{ role: 'clip', ref: { record: 'g1', output: 0 }, resolved_asset: 'take.mp4' }] })
    expect(thumbnailOf(clipRow, assets, records)).toEqual({ asset: 'still.png', kind: 'image' })
    expect(thumbnailOf(record({ id: 'v', outputs: ['clip.mp4'] }), assets, records)).toEqual({ asset: 'clip.mp4', kind: 'video' })
    expect(thumbnailOf(record({ id: 'p', outputs: ['plan.json'] }), assets, records)).toBeNull()
    expect(thumbnailOf(record({ id: 'u', outputs: ['unknown'] }), assets, records)).toBeNull()
    expect(thumbnailOf(record({ id: 'ap' }), assets, records, [render, record({ id: 'g2' })])).toEqual({ asset: 'still.png', kind: 'image' })
  })

  it('says how long ago a record was made', () => {
    const now = Date.parse('2026-10-06T12:00:00Z')
    expect(relativeTime('2026-10-06T11:59:30Z', now)).toEqual(['刚刚', 'just now'])
    expect(relativeTime('2026-10-06T11:55:00Z', now)).toEqual(['5 分钟前', '5 min ago'])
    expect(relativeTime('2026-10-06T09:00:00Z', now)).toEqual(['3 小时前', '3 h ago'])
    expect(relativeTime('2026-10-01T12:00:00Z', now)[0]).toMatch(/^10\/1 \d\d:\d\d$/)
  })
})

describe('operation labels', () => {
  it('labels an action by the label of its operation on the wire, and an unknown one by its name', () => {
    const approve: WireOperation = {
      name: 'story.approve', version: '1', description: 'Approve a plan version.', label: { zh: '批准分镜计划', en: 'Approve plan' },
      inputs: {}, params: {}, outputs: [], deterministic: false, resource: 'none', confirm: 'always',
    }
    const operations = [approve]
    expect(actionLabel(record({ id: 's', operation: 'story.approve', params: { plan: 'p1' } }), labels({ operations }))).toEqual(['批准分镜计划', 'Approve plan'])
    expect(actionLabel(record({ id: 'm', operation: 'timeline.clip_move' }), labels({ operations }))).toEqual(['移动片段', 'Move clip'])
    expect(actionLabel(record({ id: 'o', operation: 'other.thing' }), labels({ operations }))).toEqual(['other.thing', 'other.thing'])
  })
})

describe('timelines and focus', () => {
  const records = [
    record({ id: 'c', operation: 'timeline.create', params: { assets: ['a.mp4', 'b.mp4'] }, report: { clips: ['cl1', 'cl2'] } }),
    record({ id: 'c2', operation: 'timeline.create', params: { timeline: 't2', assets: ['z.mp4'] }, report: { clips: ['cl3'] } }),
    record({ id: 's', operation: 'timeline.clip_split', params: { clip: 'cl2', at_sec: 1 }, report: { clips: ['cl4'] } }),
    record({ id: 'm', operation: 'timeline.clip_move', params: { clip: 'cl4', to: 1 } }),
    record({ id: 'm2', operation: 'timeline.clip_move', params: { clip: 'cl3', to: 1 } }),
    record({ id: 'e', operation: 'timeline.export', params: { timeline: 't1' }, outputs: ['out.mp4'] }),
  ]

  it('assigns each clip to the timeline of the record that added it, a split to the split clip\'s timeline', () => {
    expect(Object.fromEntries(clipTimelines(records))).toEqual({ cl1: 't1', cl2: 't1', cl3: 't2', cl4: 't1' })
  })

  it('focuses a clip record on the timeline, a render on the canvas, and nothing for proj records or steps after the current position', () => {
    const owner = clipTimelines(records)
    const render = fixtureState().components.proj.records.find(item => item.id === 'g1') as ProjectRecord
    expect(centerFocus({ record: records[3] as ProjectRecord, place: 'before' }, owner))
      .toEqual({ event: 'dv:timeline-focus', detail: { timelineId: 't1', clipId: 'cl4' } })
    expect(centerFocus({ record: records[0] as ProjectRecord, place: 'current' }, owner))
      .toEqual({ event: 'dv:timeline-focus', detail: { timelineId: 't1', clipId: 'cl1' } })
    expect(centerFocus({ record: render, place: 'before' }, owner)).toEqual({ event: 'dv:canvas-focus', detail: { recordId: 'g1' } })
    expect(centerFocus({ record: render, place: 'after' }, owner)).toBeNull()
    expect(centerFocus(entry({ id: 's', operation: 'proj.stale_accept' }), owner)).toBeNull()
  })
})
