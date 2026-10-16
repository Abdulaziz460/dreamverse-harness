/**
 * How MiniMax H3 (model `fasth3`) names the references in its prompt.
 *
 * @module @dv/fastvideo/fasth3
 */
import type { AssignReferenceLabels } from './reference-labels.ts'

/** Assign the MiniMax H3 labels: the k-th reference image is `<Picture k>`, counting the images in input order. */
export const assignFasth3ReferenceLabels: AssignReferenceLabels = references => new Map(references
  .filter(reference => reference.mediaType === 'image')
  .map((reference, index) => [reference.asset, `<Picture ${String(index + 1)}>`]))
