/**
 * Types of the reference kit: one version of an item of a reference noun, the slice of one noun, and the keys that may
 * be declared as a reference noun. A noun package builds its own ID, version and slice types from them and merges its
 * slice and its ID type into `@dv/project/types`.
 *
 * @module @dv/reference-kit/types
 */
import type { AssetId, ComponentStates, RecordId, ReferenceKinds } from '@dv/project/types'

/** One version of an item of a reference noun. */
export interface ReferenceVersion<I extends string = string> {
  id: I
  /** 1 for the version `<k>.create` wrote, one more for each `<k>.update`. */
  version: number
  /** Display name. */
  name: string
  /** Words carried into prompts. */
  description: string
  /** The reference images the version stands for; an input that names `<id>@<version>` carries them. */
  references: AssetId[]
  /** The record that wrote this version. */
  created_by: RecordId
}

/** The slice of one noun: every version of each ID, oldest first. */
export type ReferenceSlice<V extends ReferenceVersion = ReferenceVersion> = Record<V['id'], V[]>

/** The keys that name both a component slice and a reference kind. */
type BothKeys = Extract<Extract<keyof ComponentStates, keyof ReferenceKinds>, string>

/** A key that names both a component slice of type ReferenceSlice and a reference kind. */
export type ReferenceKey = {
  [K in BothKeys]: NonNullable<ComponentStates[K]> extends ReferenceSlice ? K : never
}[BothKeys]
