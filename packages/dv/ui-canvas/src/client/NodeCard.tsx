/**
 * One canvas node as a card on the `--dv-*` theme variables. Every card has a kind dot: pink for imported assets, teal
 * for takes, and the `NodeKind` color for a seed. A take or an imported asset shows a header row (dot, title, duration)
 * above its 16:9 frame at full card width; a failed take is a compact danger row instead of a frame. A finished take
 * that the user has not opened yet shows an accent dot in its header row. A seed draws the default card: its kind label
 * and subtitle, then a seed with slots shows a mini grid of its slots' frames when any slot has one and its title, and
 * any other seed shows its first media at 40 × 40 beside its kind label and its title.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { assetUrl } from '@dv/ui-kit/api.ts'
import { NODE_WIDTH } from './graph.ts'
import type { CanvasNode, CanvasNodeKind, SlotFrame } from './graph.ts'
import type {} from './locales.ts'

/** The canvas namespace translate. */
export type CanvasTranslate = TranslateNS<'dvCanvas'>

/** The kind dot color of each node kind of the core; a seed takes the color of its `NodeKind`. */
const KIND_COLOR: Record<Exclude<CanvasNodeKind, 'seed'>, string> = {
  asset: 'var(--dv-kind-character)', take: 'var(--dv-kind-take)',
}

/**
 * @param node - the node.
 * @returns the color of its kind dot.
 */
export function kindColor(node: CanvasNode): string {
  return node.kind === 'seed' ? node.nodeKind.color : KIND_COLOR[node.kind]
}

/**
 * The node's title as the user reads it.
 * @param node - the node.
 * @param t - translate.
 * @returns the title.
 */
export function nodeTitle(node: CanvasNode, t: CanvasTranslate): string {
  if (node.kind === 'take') {
    const shot = node.title === '' ? node.label ?? t('node.takeKind') : t('node.shot', { shot: node.title })
    return node.take === null ? shot : t('node.take', { title: shot, take: node.take })
  }
  return node.title
}

/**
 * The kind label shown beside the kind dot.
 * @param node - the node.
 * @param t - translate.
 * @returns the label.
 */
export function kindLabel(node: CanvasNode, t: CanvasTranslate): string {
  switch (node.kind) {
    case 'asset': return t('node.asset')
    case 'take': return t('node.takeKind')
    case 'seed': return node.seed.label ?? node.nodeKind.label()
  }
}

/** Header row height of a card with a frame. */
const HEADER_HEIGHT = 30
/** Height of the 16:9 frame at full card width. */
const FRAME_HEIGHT = Math.round(NODE_WIDTH * 9 / 16)

/**
 * The approximate rendered height of a card at its base text size, used to anchor edges and to center a focused node.
 * @param node - the node.
 * @param hasFrames - for a seed with slots, whether its mini grid shows.
 * @returns the height in canvas units.
 */
export function nodeHeight(node: CanvasNode, hasFrames = false): number {
  switch (node.kind) {
    case 'take': return node.flags.failed ? 52 : HEADER_HEIGHT + FRAME_HEIGHT
    case 'asset': return HEADER_HEIGHT + FRAME_HEIGHT
    case 'seed': return node.seed.slots === undefined ? 60 : hasFrames ? 140 : 76
  }
}

/** Props of {@link NodeCard}. */
export interface NodeCardProps {
  node: CanvasNode
  x: number
  y: number
  selected: boolean
  /** The canvas zoom; text grows in canvas units below {@link READABLE_ZOOM} so it stays legible on screen. */
  zoom: number
  t: CanvasTranslate
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  /** For a seed with slots, the frame of each slot; null for a slot without one. */
  frames?: Array<SlotFrame | null>
  /** For a failed take, renders it again; omitted when the canvas is read-only. */
  onRetry?: () => void
  /** For a failed take, true while its retry is starting: the retry button is disabled and reads 渲染中…. */
  retrying?: boolean
  /** For a finished take, true until the user opens it in the editor. */
  unseen?: boolean
}

/** The zoom at and above which node text keeps its base size; below it text scales up to stay readable. */
const READABLE_ZOOM = 0.8
/** The largest text enlargement, reached near the minimum zoom. */
const MAX_TEXT_SCALE = 2.6

const media: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block' }
export const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
export const mono: CSSProperties = { fontFamily: 'var(--dv-font-mono)', fontVariantNumeric: 'tabular-nums' }

/**
 * The image or video of an asset, filling its box.
 * @param props - the image and video asset IDs.
 * @returns the element, or null when there is neither.
 */
function Media({ thumb, video }: { thumb: string | null; video: string | null }): ReactNode {
  if (thumb !== null) return <img src={assetUrl(thumb)} alt="" style={media} draggable={false} />
  if (video !== null) return <video src={assetUrl(video)} muted preload="metadata" style={media} />
  return null
}

/**
 * The card.
 * @param props - the node, its position, the canvas zoom, the slot frames of a seed with slots, and the gesture callbacks.
 * @returns the element.
 */
export function NodeCard(
  { node, x, y, selected, zoom, t, onPointerDown, frames = [], onRetry, retrying = false, unseen = false }: NodeCardProps,
): ReactNode {
  const { flags } = node
  const scale = Math.min(MAX_TEXT_SCALE, Math.max(1, READABLE_ZOOM / zoom))
  const size = (base: number): number => Math.round(base * scale)
  // Type scale pairs: 12/16 metadata, 13/20 titles, 14/22 names.
  const text = (base: 12 | 13 | 14): CSSProperties => ({ fontSize: size(base), lineHeight: `${String(size({ 12: 16, 13: 20, 14: 22 }[base]))}px` })
  const take = node.kind === 'take'
  const failedTake = take && flags.failed
  // A selected card wears the accent ring; a stale card a danger outline; any other card the plain outline.
  let ring = '0 0 0 1px var(--dv-line-strong), var(--dv-shadow-1)'
  if (selected) ring = '0 0 0 2px var(--dv-accent), 0 0 0 6px var(--dv-accent-soft)'
  else if (flags.stale) ring = '0 0 0 1px var(--dv-danger), var(--dv-shadow-1)'
  else if (failedTake) ring = '0 0 0 1px var(--dv-line)'
  const style: CSSProperties = {
    position: 'absolute', left: x, top: y, width: NODE_WIDTH, boxSizing: 'border-box', background: failedTake ? 'var(--dv-danger-soft)' : 'var(--dv-surface-2)',
    color: 'var(--dv-text)', borderRadius: 'var(--dv-radius-lg)', boxShadow: ring, cursor: 'grab', userSelect: 'none', overflow: 'hidden',
    opacity: flags.superseded ? 0.55 : 1, touchAction: 'none',
  }
  let marker: string | null = null
  if (flags.rendering) marker = take ? t('node.rendering') : t('node.running')
  else if (flags.failed) marker = take ? t('node.renderFailed') : t('node.failed')
  const dot = <span style={{ flex: 'none', width: size(6), height: size(6), borderRadius: 9999, background: kindColor(node) }} />
  const stale = flags.stale ? <span style={{ ...text(12), flex: 'none', color: 'var(--dv-danger)' }}>{t('node.stale')}</span> : null
  // The badges of the registered `TakesInUse` descriptors, such as 已裁剪: over the frame's bottom-left corner, or a row
  // under a card without a frame.
  const badges = (overFrame: boolean): ReactNode => node.badges.length === 0
    ? null
    : (
      <span style={overFrame ? { position: 'absolute', left: 6, bottom: 6, display: 'flex', gap: 4 } : { display: 'flex', gap: 4, padding: '0 10px 10px' }}>
        {node.badges.map(badge => <span key={badge} style={{ ...text(12), padding: '0 6px', borderRadius: 'var(--dv-radius-sm)', background: 'var(--dv-surface-3)', color: 'var(--dv-text-2)' }}>{badge}</span>)}
      </span>
    )
  // The kind label beside the dot, followed by a seed's subtitle.
  let header = kindLabel(node, t)
  if (node.kind === 'seed' && node.subtitle !== '') header = `${header} · ${node.subtitle}`
  let body: ReactNode
  if (failedTake) {
    // A failed take has no frame: a compact row with the failure, the reason on hover, and 重试 when it can render again.
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <svg width={size(16)} height={size(16)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', color: 'var(--dv-danger)' }} aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
        </svg>
        <span style={{ ...text(12), flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...ellipsis }}>{nodeTitle(node, t)}</span>
          <span style={{ display: 'block', color: 'var(--dv-text-2)', ...ellipsis }}>{marker}</span>
        </span>
        {stale}
        {onRetry === undefined
          ? null
          : (
            <button
              type="button" className="dv-canvas-btn" disabled={retrying}
              style={{ fontFamily: 'inherit', ...text(12), flex: 'none', height: 24, padding: '0 8px', border: '1px solid var(--dv-line-strong)', borderRadius: 'var(--dv-radius-sm)', color: 'var(--dv-text)', cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.6 : 1 }}
              onPointerDown={(event) => { event.stopPropagation() }}
              onClick={onRetry}
            >
              {retrying ? t('node.rendering') : t('node.retry')}
            </button>
          )}
      </div>
    )
  } else if (node.kind === 'seed' && node.seed.slots === undefined) {
    const extra = node.references.length - 1
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
        <div style={{ position: 'relative', flex: 'none', width: 40, height: 40, borderRadius: 'var(--dv-radius-md)', overflow: 'hidden', background: 'var(--dv-surface-3)' }}>
          {node.video !== null
            ? <video src={`${assetUrl(node.video)}#t=0.1`} muted preload="metadata" style={media} />
            : node.references[0] === undefined ? null : <img src={assetUrl(node.references[0])} alt="" style={media} draggable={false} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ ...text(12), display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dv-text-2)' }}>
            {dot}{header}
            {extra > 0 ? <span style={mono}>{t('node.moreReferences', { count: extra })}</span> : null}
            {stale}
          </span>
          <span style={{ ...text(14), fontWeight: 500, ...ellipsis }}>{node.title}</span>
          {marker === null ? null : <span style={{ ...text(12), color: flags.failed ? 'var(--dv-danger)' : 'var(--dv-text-2)' }}>{marker}</span>}
        </div>
      </div>
    )
  } else if (node.kind === 'seed') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
        <span style={{ ...text(12), display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dv-text-2)' }}>
          {dot}<span style={{ flex: 1, minWidth: 0, ...ellipsis }}>{header}</span>{stale}
        </span>
        {frames.some(frame => frame !== null)
          ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3 }}>
              {frames.map((frame, index) => (
                <div key={index} style={{ aspectRatio: '16 / 9', borderRadius: 3, overflow: 'hidden', background: 'var(--dv-surface-3)' }}>
                  {frame === null ? null : <Media {...frame} />}
                </div>
              ))}
            </div>
          )
          : null}
        <span style={{ ...text(14), fontWeight: 500 }}>{node.title}</span>
        {marker === null ? null : <span style={{ ...text(12), color: flags.failed ? 'var(--dv-danger)' : 'var(--dv-text-2)' }}>{marker}</span>}
      </div>
    )
  } else {
    // A take or an imported asset: the header row above the 16:9 frame at full card width.
    body = (
      <>
        <div style={{ minHeight: size(HEADER_HEIGHT), boxSizing: 'border-box', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          {dot}
          <span style={{ ...text(13), flex: 1, minWidth: 0, fontWeight: 500, ...ellipsis }}>{nodeTitle(node, t)}</span>
          {unseen
            ? <span role="img" aria-label={t('node.unseen')} title={t('node.unseen')} style={{ flex: 'none', width: size(8), height: size(8), borderRadius: 9999, background: 'var(--dv-accent)' }} />
            : null}
          {stale}
          {node.durationSec !== null ? <span style={{ ...text(12), ...mono, flex: 'none', color: 'var(--dv-text-2)' }}>{`${node.durationSec.toFixed(1)}s`}</span> : null}
        </div>
        <div style={{ position: 'relative', width: NODE_WIDTH, height: FRAME_HEIGHT, background: 'var(--dv-surface-3)', overflow: 'hidden' }}>
          <Media thumb={node.thumb} video={node.video} />
          {marker !== null
            ? <span style={{ ...text(13), position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dv-overlay)', color: 'var(--dv-text)', fontWeight: 500 }}>{marker}</span>
            : null}
          {badges(true)}
        </div>
      </>
    )
  }
  return (
    <div
      style={style}
      data-node-id={node.id}
      data-node-kind={node.kind === 'seed' ? node.nodeKind.kind : node.kind}
      data-node-stale={String(flags.stale)}
      data-node-selected={selected ? 'true' : undefined}
      data-node-unseen={unseen ? 'true' : undefined}
      onPointerDown={onPointerDown}
      role="button"
      tabIndex={0}
      aria-label={nodeTitle(node, t)}
      title={failedTake ? node.record?.error?.message : undefined}
    >
      {body}
      {node.kind === 'take' || node.kind === 'asset' ? null : badges(false)}
    </div>
  )
}
