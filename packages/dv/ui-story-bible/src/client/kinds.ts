/**
 * The reference kinds of `@dv/story-bible` as the browser half reads them from the `bible` slice, the versions of one
 * kind by ID, and the canvas node ID of an item. The canvas descriptors and the editor entry of `@dv/ui-story-bible` share them.
 *
 * @module @dv/ui-story-bible/kinds
 */
import type { Character, Location, StoryBibleState, Style } from '@dv/story-bible/types'
import { pickText } from '@dv/ui-kit/locale.ts'
import type { WireState } from '@dv/ui-kit/types.ts'

/** Each reference kind of `@dv/story-bible` in canvas order: its key, the slice field of its items, and its card label. */
export const KINDS: ReadonlyArray<{ kind: string; field: keyof StoryBibleState; label: () => string }> = [
  { kind: 'character', field: 'characters', label: () => pickText('角色', 'Character') },
  { kind: 'location', field: 'locations', label: () => pickText('场景', 'Location') },
  { kind: 'style', field: 'styles', label: () => pickText('风格', 'Style') },
]

/**
 * The items of one reference kind: the versions of each ID, oldest first, keyed by the ID as a plain string.
 * @param state - a project state.
 * @param field - the slice field of the kind's items.
 * @returns the versions by ID.
 */
export function itemsOf(
  state: WireState, field: keyof StoryBibleState,
): Readonly<Record<string, ReadonlyArray<Character | Location | Style>>> {
  return state.components.bible[field]
}

/**
 * @param id - a character, location or style ID.
 * @returns the canvas node ID of the item, `bible:<id>`.
 */
export function bibleNode(id: string): string {
  return `bible:${id}`
}
