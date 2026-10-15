/**
 * How MiniMax H3 (model `fasth3`) names the references in its prompt.
 *
 * @module @dv/fastvideo/fasth3
 */
import type { ReferenceLabels } from './reference-labels.ts'

/** MiniMax H3 labels the k-th reference image `<Picture k>`, counting the images in input order. */
export const fasth3ReferenceLabels: ReferenceLabels = references => new Map(references
  .filter(reference => reference.mediaType === 'image')
  .map((reference, index) => [reference.asset, `<Picture ${String(index + 1)}>`]))
