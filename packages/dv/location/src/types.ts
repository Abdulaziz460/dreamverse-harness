/**
 * Types of the location component: the ID and one version of a location, and the `location` slice, merged into
 * `@dv/project/types`.
 *
 * @module @dv/location/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ReferenceSlice, ReferenceVersion } from '@dv/reference-kit/types'

/** The ID of a location, chosen by the caller of `location.create`, such as `l1`. */
export type LocationId = Branded<'DvLocationId'>

/** One version of a location: a place shots happen in. */
export type Location = ReferenceVersion<LocationId>

/** The `location` slice: every version of each location, oldest first, by ID. */
export type LocationState = ReferenceSlice<Location>

declare module '@dv/project/types' {
  interface ComponentStates { location: LocationState }
  interface ReferenceKinds { location: LocationId }
}
