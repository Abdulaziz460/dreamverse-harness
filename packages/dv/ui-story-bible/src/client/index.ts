/**
 * Browser half of the story bible: the canvas node kind that draws each character, location and style at its newest
 * version, one version kind per reference kind (`character`, `location`, `style`), and the records whose outputs the
 * newest versions use as references. Each reads only the `bible` slice and the `proj` records.
 *
 * @module @dv/ui-story-bible/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { pickText } from '@dv/ui-kit/locale.ts'
import type { NodeKind, NodeSeed, TakesInUse, VersionKind } from '@dv/ui-kit/registries.ts'
import type { Character, StoryBibleState, WireState } from '@dv/ui-kit/types.ts'

/** Each reference kind of `@dv/story-bible` in canvas order: its key, the slice field of its items, and its card label. */
const KINDS: ReadonlyArray<{ kind: string; field: keyof StoryBibleState; label: () => string }> = [
  { kind: 'character', field: 'characters', label: () => pickText('角色', 'Character') },
  { kind: 'location', field: 'locations', label: () => pickText('场景', 'Location') },
  { kind: 'style', field: 'styles', label: () => pickText('风格', 'Style') },
]

/**
 * @param id - a character, location or style ID.
 * @returns the canvas node ID of the item, `bible:<id>`.
 */
function bibleNode(id: string): string {
  return `bible:${id}`
}

/**
 * @param state - a project state.
 * @param field - the slice field of the item's kind.
 * @param id - the item ID.
 * @param version - the version number.
 * @returns the version, or undefined when the slice has no such item or version.
 */
function versionOf(state: WireState, field: keyof StoryBibleState, id: string, version: number): Character | undefined {
  return state.components.bible[field][id]?.find(entry => entry.version === version)
}

/** The version kinds of `character`, `location` and `style`: node `bible:<id>`, the version's name and references. */
export const bibleVersionKinds: readonly VersionKind[] = KINDS.map(({ kind, field }) => ({
  kind,
  node: bibleNode,
  latest: state => Object.entries(state.components.bible[field]).flatMap(([id, versions]) => {
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
    return KINDS.flatMap(({ field, label }) => Object.entries(state.components.bible[field]).flatMap(([id, versions]): NodeSeed[] => {
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
    return KINDS.flatMap(({ field }) => Object.values(state.components.bible[field]))
      .flatMap(versions => versions.at(-1)?.references ?? []).flatMap(reference => createdBy[reference] ?? [])
  },
}

/**
 * Client plugin body: while `dvCanvas` is present, register the node kind, the references in use and the three version
 * kinds. Each registration leaves with the service or with the plugin.
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
}
