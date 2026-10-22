/**
 * The media of one asset as the canvas and the plan editor draw it: an image asset as an image, a video asset as its
 * first frame.
 *
 * @module @dv/ui-kit/asset-media
 */
import type { CSSProperties, ReactNode } from 'react'
import { assetUrl } from './api.ts'

/**
 * An image asset as an image and a video asset as its first frame; nothing for another media type or a missing asset.
 * @param props - the asset (its ID and MIME type) and the media's style.
 * @returns the element.
 */
export function AssetMedia(props: { asset: { id: string; mime: string } | undefined; style: CSSProperties }): ReactNode {
  const { asset, style } = props
  if (asset === undefined) return null
  if (asset.mime.startsWith('video/')) return <video src={`${assetUrl(asset.id)}#t=0.1`} muted preload="metadata" style={style} />
  if (asset.mime.startsWith('image/')) return <img src={assetUrl(asset.id)} alt="" style={style} draggable={false} />
  return null
}
