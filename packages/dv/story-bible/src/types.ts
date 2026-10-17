/**
 * Types of the Story bible component: the IDs of characters, locations and styles, one version of each, and the `bible`
 * slice of the project state. Record inputs name a version with these ID types through the `ReferenceKinds` merge.
 *
 * @module @dv/story-bible/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { AssetId, RecordId } from '@dv/project'

/** The ID of a character, chosen by the caller of `bible.character_create`, such as `c1`. */
export type CharacterId = Branded<'DvCharacterId'>

/** The ID of a location, chosen by the caller of `bible.location_create`, such as `l1`. */
export type LocationId = Branded<'DvLocationId'>

/** The ID of a style, chosen by the caller of `bible.style_create`, such as `s1`. */
export type StyleId = Branded<'DvStyleId'>

/** One version of a character: a person who must look the same across shots. */
export interface Character {
  id: CharacterId
  /** 1 for the version `bible.character_create` wrote, one more for each `bible.character_update`. */
  version: number
  /** Display name. */
  name: string
  /** Wardrobe and mood words carried into prompts. */
  description: string
  /** The reference images the version stands for; a shot that names `<id>@<version>` carries them. */
  references: AssetId[]
  /** The record that wrote this version. */
  created_by: RecordId
}

/** One version of a location: a place shots happen in. */
export interface Location {
  id: LocationId
  /** 1 for the version `bible.location_create` wrote, one more for each `bible.location_update`. */
  version: number
  /** Display name. */
  name: string
  /** Look and mood words carried into prompts. */
  description: string
  /** The reference images the version stands for. */
  references: AssetId[]
  /** The record that wrote this version. */
  created_by: RecordId
}

/** One version of a style: a reusable visual look with reference images. */
export interface Style {
  id: StyleId
  /** 1 for the version `bible.style_create` wrote, one more for each `bible.style_update`. */
  version: number
  /** Display name. */
  name: string
  /** Style words carried into prompts. */
  description: string
  /** The reference images the version stands for. */
  references: AssetId[]
  /** The record that wrote this version. */
  created_by: RecordId
}

/** The `bible` slice: every version of each character, location and style, oldest first, by ID. */
export interface StoryBibleState {
  characters: Record<CharacterId, Character[]>
  locations: Record<LocationId, Location[]>
  styles: Record<StyleId, Style[]>
}

declare module '@dv/project' {
  interface ComponentStates {
    /** Characters, locations and styles with their versions (the Story bible component). */
    bible: StoryBibleState
  }
  /** The reference kinds of the Story bible; an input names a version as `<id>@<version>`. */
  interface ReferenceKinds { character: CharacterId; location: LocationId; style: StyleId }
}
