/**
 * The labels that a served model reads in its prompt for the references of a render request, and the prompt with each
 * citation of a reference replaced by its label. Each served model declares its own `ReferenceLabels`.
 *
 * @module @dv/fastvideo/reference-labels
 */
import type { RenderRequest } from '@dv/models'
import { citedAsset, replacePromptCitations, type AssetId } from '@dv/project'

/** One reference of a render request with its media type, such as `image`, as `dvAssetPool.mediaType` returns it. */
export interface ReferenceMedia {
  asset: AssetId
  mediaType: string
}

/**
 * How a model names the references of one render request.
 * @param references - the references in input order.
 * @returns the label of each reference that the model names; a reference without a label has no entry.
 */
export type ReferenceLabels = (references: readonly ReferenceMedia[]) => ReadonlyMap<AssetId, string>

/**
 * The prompt that a model reads: each citation of a reference replaced with the model's label of that reference. A
 * citation of anything other than a reference, or of a reference that the model has no label for, becomes its label.
 * @param request - the render request.
 * @param referenceLabels - the model's labels of the references.
 * @param mediaTypeOf - the media type of an asset, read from the asset pool.
 * @returns the prompt.
 */
export function modelPrompt(request: RenderRequest, referenceLabels: ReferenceLabels, mediaTypeOf: (asset: AssetId) => string): string {
  const labels = referenceLabels(request.references.map(asset => ({ asset, mediaType: mediaTypeOf(asset) })))
  return replacePromptCitations(request.prompt, (citation) => {
    const asset = citedAsset(citation.uri)
    return (asset === null ? undefined : labels.get(asset)) ?? citation.label
  })
}
