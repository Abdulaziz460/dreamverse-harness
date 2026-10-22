/**
 * Types of the style component: the ID and one version of a style, and the `style` slice, merged into
 * `@dv/project/types`.
 *
 * @module @dv/style/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ReferenceSlice, ReferenceVersion } from '@dv/reference-kit/types'

/** The ID of a style, chosen by the caller of `style.create`, such as `s1`. */
export type StyleId = Branded<'DvStyleId'>

/** One version of a style: a reusable visual look. */
export type Style = ReferenceVersion<StyleId>

/** The `style` slice: every version of each style, oldest first, by ID. */
export type StyleState = ReferenceSlice<Style>

declare module '@dv/project/types' {
  interface ComponentStates { style: StyleState }
  interface ReferenceKinds { style: StyleId }
}
