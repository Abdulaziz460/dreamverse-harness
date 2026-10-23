/**
 * Which reference assets of a shot the video model numbers as `Picture N`.
 *
 * @module @dv/ui-shot-plan/picture
 */
import type { ProjectAsset } from '@dv/ui-kit/types.ts'

/**
 * Whether the video model numbers a reference asset as `Picture N`: the asset is an image. Among a shot's reference
 * assets in input order, the N-th image is `Picture N`.
 * @param asset - one reference asset.
 * @returns whether the asset is a picture.
 */
export function isPicture(asset: Pick<ProjectAsset, 'mime'>): boolean {
  return asset.mime.startsWith('image/')
}
