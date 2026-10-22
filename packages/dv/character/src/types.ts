/**
 * Types of the character component: the ID and one version of a character, and the `character` slice, merged into
 * `@dv/project/types`.
 *
 * @module @dv/character/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ReferenceSlice, ReferenceVersion } from '@dv/reference-kit/types'

/** The ID of a character, chosen by the caller of `character.create`, such as `c1`. */
export type CharacterId = Branded<'DvCharacterId'>

/** One version of a character: a person who must look the same across shots. */
export type Character = ReferenceVersion<CharacterId>

/** The `character` slice: every version of each character, oldest first, by ID. */
export type CharacterState = ReferenceSlice<Character>

declare module '@dv/project/types' {
  interface ComponentStates { character: CharacterState }
  interface ReferenceKinds { character: CharacterId }
}
