/**
 * The `bible` reducer: every version of each character, location and style, from the finished `bible.*` records. Each
 * kind is also a reference kind of Project, which answers from the slice: `assetsOf` (the reference images a
 * `<id>@<version>` input stands for), `createdBy` (the record that wrote that version, which Project treats as the
 * input's producer for stale marks) and `latest` (an ID's newest version, which Project's `kindsWithId` reads).
 *
 * @module @dv/story-bible/reducer
 */
import type { AssetId, ProjectRecord, Reducer, ReferenceKindSpec } from '@dv/project'
import type { Character, Location, Style, StoryBibleState } from './types.ts'

/** The three kinds of story element; each is the ID param name of its operations and a reference kind. */
export type BibleKind = 'character' | 'location' | 'style'

/** The kinds, in registration order. */
export const BIBLE_KINDS: readonly BibleKind[] = ['character', 'location', 'style']

/** The slice field that holds each kind's versions. */
const FIELD = { character: 'characters', location: 'locations', style: 'styles' } as const satisfies Record<BibleKind, keyof StoryBibleState>

/** The fields every version has; `Character`, `Location` and `Style` differ only in the brand of `id`. */
type Version = Omit<Character, 'id'> & { id: string }

/** `bible.<kind>_create` and `bible.<kind>_update`. */
const OPERATION = /^bible\.(character|location|style)_(create|update)$/

/**
 * Classify an operation name as a Story bible operation.
 * @param name - an operation name, or null for a request record.
 * @returns the kind and the verb, or null for any other operation.
 */
export function parseBibleOperation(name: string | null): { kind: BibleKind; verb: 'create' | 'update' } | null {
  const match = name === null ? null : OPERATION.exec(name)
  if (match === null) return null
  return { kind: match[1] as BibleKind, verb: match[2] as 'create' | 'update' }
}

/**
 * @param slice - the `bible` slice.
 * @param kind - a kind.
 * @returns that kind's versions by ID.
 */
function versionsOf(slice: StoryBibleState, kind: BibleKind): Record<string, Version[]> {
  return slice[FIELD[kind]]
}

/**
 * @param slice - the `bible` slice.
 * @param kind - a kind.
 * @param id - an ID of that kind.
 * @returns the ID's latest version, or undefined for an unknown ID.
 */
export function latestVersion(slice: StoryBibleState, kind: BibleKind, id: string): Version | undefined {
  return versionsOf(slice, kind)[id]?.at(-1)
}

/**
 * The reference kind of one story element kind: it answers for a version from the `bible` slice.
 * @param kind - the kind.
 * @returns the spec that `dvProject.registerReferenceKind` takes.
 */
export function referenceKind(kind: BibleKind): ReferenceKindSpec<'bible'> {
  const versionOf = (slice: StoryBibleState, id: string, version: number): Version | undefined =>
    versionsOf(slice, kind)[id]?.find(candidate => candidate.version === version)
  return {
    kind,
    component: 'bible',
    assetsOf: (slice, id, version) => versionOf(slice, id, version)?.references ?? null,
    createdBy: (slice, id, version) => versionOf(slice, id, version)?.created_by ?? null,
    latest: (slice, id) => latestVersion(slice, kind, id)?.version ?? null,
  }
}

/**
 * The version a finished `bible.*` record writes: create starts at the next free version number (1 for a new ID);
 * update keeps the name, the description and the reference images the call does not change.
 * @param versions - the ID's versions before the record.
 * @param id - the ID.
 * @param record - the record.
 * @returns the version.
 */
function nextVersion(versions: readonly Version[], id: string, record: ProjectRecord): Version {
  const previous = versions.at(-1)
  const references = record.inputs.filter(input => input.role === 'reference').map(input => input.resolved_asset)
    .filter((asset): asset is AssetId => asset !== null)
  const name = record.params['name']
  const description = record.params['description']
  return {
    id,
    version: versions.length + 1,
    name: typeof name === 'string' ? name : previous?.name ?? id,
    description: typeof description === 'string' ? description : previous?.description ?? '',
    references: references.length > 0 || previous === undefined ? references : previous.references,
    created_by: record.id,
  }
}

/**
 * The latest version of each character, location or style, as the agent's project summary lists it.
 * @param versions - one kind's versions by ID, oldest first.
 * @returns per ID: the ID, its latest version number, name, description and reference images.
 */
function latestVersions(
  versions: Record<string, ReadonlyArray<Character | Location | Style>>,
): Array<Pick<Character | Location | Style, 'id' | 'version' | 'name' | 'description' | 'references'>> {
  return Object.values(versions).flatMap((list) => {
    const latest = list.at(-1)
    return latest === undefined ? [] : [{
      id: latest.id, version: latest.version, name: latest.name, description: latest.description, references: latest.references,
    }]
  })
}

/** The `bible` reducer, registered by `dvStoryBible`. */
export const bibleReducer: Reducer<'bible'> = {
  initial: () => ({ characters: {}, locations: {}, styles: {} }),
  reduce(slice, record) {
    const operation = parseBibleOperation(record.operation)
    if (operation === null || record.status !== 'done') return slice
    const id = String(record.params[operation.kind])
    const versions = versionsOf(slice, operation.kind)[id] ?? []
    const byId = { ...versionsOf(slice, operation.kind), [id]: [...versions, nextVersion(versions, id, record)] }
    return { ...slice, [FIELD[operation.kind]]: byId }
  },
  agentSummary(slice) {
    return {
      characters: latestVersions(slice.characters),
      locations: latestVersions(slice.locations),
      styles: latestVersions(slice.styles),
    }
  },
}
