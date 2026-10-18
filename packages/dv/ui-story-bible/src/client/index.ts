/**
 * Browser half of the story bible: the canvas node kind that draws each character, location and style at its newest
 * version, one version kind per reference kind (`character`, `location`, `style`), the records whose outputs the
 * newest versions use as references, the editor body of a story bible node (the `dv.canvas.editor` entry), one mention
 * kind per reference kind for the composer's `@` menu, and the History row that names the item of a story bible record.
 * Each reads only the `bible` slice and the `proj` records, and the History row only its record's params.
 *
 * @module @dv/ui-story-bible/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Character, Location, StoryBibleState, Style } from '@dv/story-bible/types'
import { pickText } from '@dv/ui-kit/locale.ts'
import type { HistoryRow, MentionKind, NodeKind, NodeSeed, TakesInUse, VersionKind } from '@dv/ui-kit/registries.ts'
import type { WireState } from '@dv/ui-kit/types.ts'
import { BibleEditor } from './BibleEditor.tsx'
import { bibleNode, itemsOf, KINDS } from './kinds.ts'

declare module '@dv/ui-kit/types.ts' { interface ComponentStates { bible: StoryBibleState } }

/**
 * @param state - a project state.
 * @param field - the slice field of the item's kind.
 * @param id - the item ID.
 * @param version - the version number.
 * @returns the version, or undefined when the slice has no such item or version.
 */
function versionOf(state: WireState, field: keyof StoryBibleState, id: string, version: number): Character | Location | Style | undefined {
  return itemsOf(state, field)[id]?.find(entry => entry.version === version)
}

/**
 * The version kinds of `character`, `location` and `style`: the kind's card label, node `bible:<id>`, the version's name
 * and references.
 */
export const bibleVersionKinds: readonly VersionKind[] = KINDS.map(({ kind, field, label }) => ({
  kind,
  label,
  node: bibleNode,
  latest: state => Object.entries(itemsOf(state, field)).flatMap(([id, versions]) => {
    const latest = versions.at(-1)
    return latest === undefined ? [] : [{ id, version: latest.version }]
  }),
  name: (state, id, version) => versionOf(state, field, id, version)?.name ?? null,
  assets: (state, id, version) => versionOf(state, field, id, version)?.references ?? [],
}))

/**
 * The canvas node kind of the story bible: one seed per character, location and style, characters first, showing the
 * newest version (its name, else its ID, and its references) and labeled with its kind; the records of the earlier
 * versions center the seed on a history focus.
 */
export const bibleNodeKind: NodeKind = {
  id: '@dv/ui-story-bible',
  kind: 'bible',
  label: () => pickText('故事设定', 'Story bible'),
  color: 'var(--dv-kind-character)',
  column: 0,
  nodes(state) {
    const records = new Map(state.components.proj.records.map(record => [record.id, record]))
    return KINDS.flatMap(({ field, label }) => Object.entries(itemsOf(state, field)).flatMap(([id, versions]): NodeSeed[] => {
      const latest = versions.at(-1)
      if (latest === undefined) return []
      return [{
        id: bibleNode(id), record: records.get(latest.created_by) ?? null, records: versions.slice(0, -1).map(entry => entry.created_by),
        label: label(), title: latest.name || id, media: latest.references,
      }]
    }))
  },
}

/** The records whose outputs the newest version of a character, location or style uses as a reference. */
export const bibleReferencesInUse: TakesInUse = {
  id: '@dv/ui-story-bible',
  uses(state) {
    const createdBy = state.components.proj.created_by
    return KINDS.flatMap(({ field }) => Object.values(itemsOf(state, field)))
      .flatMap(versions => versions.at(-1)?.references ?? []).flatMap(reference => createdBy[reference] ?? [])
  },
}

/**
 * The `@` menu kinds of `character` (section 角色) and of `location` and `style` (one section 场景和风格), in that order:
 * each item is the newest version of an ID, with its name (else its ID), the start of its description, and its first
 * reference as the thumbnail.
 */
export const bibleMentionKinds: readonly MentionKind[] = KINDS.map(({ kind, field }, index) => ({
  id: `${bibleNodeKind.id}:${kind}`,
  kind,
  order: index + 1,
  section: () => field === 'characters' ? pickText('角色', 'Characters') : pickText('场景和风格', 'Locations and styles'),
  items: state => Object.entries(itemsOf(state, field)).flatMap(([id, versions]) => {
    const latest = versions.at(-1)
    if (latest === undefined) return []
    const thumb = latest.references[0]
    return [{
      uri: `dv:${kind}/${encodeURIComponent(id)}`, label: latest.name || id, description: latest.description.slice(0, 40),
      ...thumb === undefined ? {} : { thumb },
    }]
  }),
}))

/** The params that name a story bible item, in the order that the History row reads them: the name, then the ID. */
const NAME_PARAMS = ['name', ...KINDS.map(({ kind }) => kind)]

/**
 * The History row of every `bible.*` operation: the name that the record gives its character, location or style
 * (`「阿明」` / ` “阿明”`), else the item ID of its kind param, else no subject.
 */
export const bibleHistoryRow: HistoryRow = {
  match: 'bible.',
  subject(record) {
    for (const key of NAME_PARAMS) {
      const value = record.params[key]
      const name = typeof value === 'number' ? String(value) : value
      if (typeof name === 'string' && name !== '') return [`「${name}」`, ` “${name}”`]
    }
    return null
  },
}

/**
 * Client plugin body: while `dvCanvas` is present, register the node kind, the references in use and the three version
 * kinds; while the slot registry is present, register the editor body of the node kind as its `dv.canvas.editor`
 * entry; while `dvMentions` is present, register the three mention kinds; while `dvHistory` is present, register the
 * History row. Each registration leaves with its service or with the plugin.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.inject(['dvCanvas'], (scope) => {
    scope.effect(() => scope.dvCanvas.nodeKinds.register(bibleNodeKind), 'ui-story-bible: node kind')
    scope.effect(() => scope.dvCanvas.takesInUse.register(bibleReferencesInUse), 'ui-story-bible: references in use')
    for (const kind of bibleVersionKinds) {
      scope.effect(() => scope.dvCanvas.versionKinds.register(kind), `ui-story-bible: version kind ${kind.kind}`)
    }
  })
  ctx.inject(['slots'], (scope) => {
    scope.effect(() => scope.slots.inject('dv.canvas.editor', () => scope.slots.register(
      { name: 'dv.canvas.editor', key: bibleNodeKind.id }, BibleEditor,
    )), 'ui-story-bible: editor')
  })
  ctx.inject(['dvMentions'], (scope) => {
    for (const kind of bibleMentionKinds) {
      scope.effect(() => scope.dvMentions.kinds.register(kind), `ui-story-bible: mention kind ${kind.kind}`)
    }
  })
  ctx.inject(['dvHistory'], (scope) => {
    scope.effect(() => scope.dvHistory.rows.register(bibleHistoryRow), 'ui-story-bible: history row')
  })
}
