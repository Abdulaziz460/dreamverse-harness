/**
 * The clip mention kind of the composer's `@` menu: every clip of every timeline by timeline name and position.
 *
 * @module @dv/ui-timeline/mention
 */
import { pickText } from '@dv/ui-kit/locale.ts'
import type { MentionKind } from '@dv/ui-kit/registries.ts'
import { timelineName } from '@dv/ui-kit/timeline.ts'
import { timelinesOf } from './timelines.ts'

/**
 * The `@` menu kind `clip` (section 片段), listed before every other kind: each clip of each timeline as
 * `时间线 1 · 片段 2` (`Timeline 1 · Clip 2` in English, for an unnamed timeline), with the start of the prompt of the
 * record that made its asset, and as the thumbnail that record's image output, else the clip's own asset.
 */
export const clipMentionKind: MentionKind = {
  id: '@dv/ui-timeline',
  kind: 'clip',
  order: 0,
  section: () => pickText('片段', 'Clips'),
  items(state) {
    const proj = state.components.proj
    const records = new Map(proj.records.map(record => [record.id, record]))
    const images = new Set(state.assets.filter(asset => asset.mime.startsWith('image/')).map(asset => asset.id))
    return timelinesOf(state).flatMap(timeline => timeline.clips.map((clip, position) => {
      // A placeholder clip (no asset yet) takes its prompt from the render it waits for and shows no thumbnail.
      const producer = records.get(clip.asset === null ? clip.source?.record ?? '' : proj.created_by[clip.asset] ?? '')
      const thumb = producer?.outputs.find(id => images.has(id)) ?? clip.asset ?? undefined
      const name = timelineName(timeline, n => pickText(`时间线 ${String(n)}`, `Timeline ${String(n)}`))
      const prompt = typeof producer?.params['prompt'] === 'string' ? producer.params['prompt'] : ''
      return {
        uri: `dv:clip/${encodeURIComponent(clip.id)}`,
        label: pickText(`${name} · 片段 ${String(position + 1)}`, `${name} · Clip ${String(position + 1)}`),
        ...prompt === '' ? {} : { description: prompt.slice(0, 40) },
        ...thumb === undefined ? {} : { thumb },
      }
    }))
  },
}
