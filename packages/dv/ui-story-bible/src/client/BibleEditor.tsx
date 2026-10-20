/**
 * The editor body of a story bible node, which `@dv/ui-story-bible` registers as its `dv.canvas.editor` entry: the
 * references of the item's newest version, each opening the canvas's preview and removable while more than one is left,
 * the version's description, and "添加素材", which appends the assets picked in the canvas's picker. Each change writes
 * the next version with `bible.<kind>_update` through the canvas host.
 *
 * @module @dv/ui-story-bible/BibleEditor
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { assetUrl } from '@dv/ui-kit/api.ts'
import { useText } from '@dv/ui-kit/locale.ts'
import { bibleNode, itemsOf, KINDS } from './kinds.ts'

// The `dv-canvas-btn` class of the canvas stylesheet paints the fill and the hover of these buttons.
const button: CSSProperties = {
  height: 32, border: '1px solid var(--dv-line-strong)', borderRadius: 'var(--dv-radius-md)', padding: '0 12px', fontFamily: 'inherit', fontSize: 13,
  lineHeight: '20px', fontWeight: 500, color: 'var(--dv-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const label: CSSProperties = { display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: 'var(--dv-text-2)', margin: '12px 0 4px' }
const referenceImage: CSSProperties = { height: 220, borderRadius: 'var(--dv-radius-md)', background: 'var(--dv-surface-3)' }

/**
 * The editor body of the story bible node that `node` draws; nothing when no character, location or style has that node.
 * @param props - the entry, the state it came from, and the canvas host.
 * @returns the element.
 */
export function BibleEditor({ node, state, host }: PropsRuntime<'dv.canvas.editor'>): ReactNode {
  const pick = useText()
  const item = KINDS.flatMap(({ kind, field }) => Object.entries(itemsOf(state, field)).flatMap(([id, versions]) => {
    const latest = versions.at(-1)
    return bibleNode(id) === node.id && latest !== undefined ? [{ kind, id, latest }] : []
  }))[0]
  if (item === undefined) return null
  const { kind, id, latest } = item
  const name = latest.name || id
  const references: readonly string[] = latest.references
  const assets = new Map(state.assets.map(asset => [asset.id, asset]))
  // `bible.<kind>_update` writes the next version with exactly these references.
  const update = (next: readonly string[], intent: string): void => {
    host.run({ operation: `bible.${kind}_update`, params: { [kind]: id }, inputs: next.map(ref => ({ role: 'reference', ref })), intent })
  }
  const addReferences = (picked: readonly string[]): void => {
    const added = picked.filter(ref => !references.includes(ref))
    if (added.length > 0) update([...references, ...added], pick(`在画布上给 ${name} 添加参考`, `Add references to ${name} from the canvas`))
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {references.map((reference) => {
          const asset = assets.get(reference)
          const assetName = asset?.name ?? reference
          const src = assetUrl(reference)
          return (
            <div key={reference} style={{ position: 'relative' }}>
              <button
                type="button" data-reference={reference} aria-label={pick(`查看 ${assetName}`, `View ${assetName}`)}
                style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'block' }}
                onClick={(event) => { if (asset !== undefined) host.preview(reference, event.currentTarget) }}
              >
                {/* An image shows itself and a video its first frame; any other asset shows nothing. */}
                {asset?.mime.startsWith('image/') === true ? <img src={src} alt="" style={referenceImage} draggable={false} /> : null}
                {asset?.mime.startsWith('video/') === true ? <video src={`${src}#t=0.1`} muted preload="metadata" style={referenceImage} /> : null}
              </button>
              {/* An update without references keeps the current ones, so the last reference cannot be removed. */}
              <button
                type="button" className="dv-canvas-btn" aria-label={pick(`移除 ${assetName}`, `Remove ${assetName}`)} disabled={references.length < 2}
                style={{ ...button, position: 'absolute', top: 6, right: 6, width: 28, height: 28, padding: 0, background: 'var(--dv-surface-1)', opacity: references.length < 2 ? 0.5 : 1 }}
                onClick={() => { update(references.filter(other => other !== reference), pick(`在画布上移除 ${name} 的一个参考`, `Remove a reference of ${name} from the canvas`)) }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      {latest.description === '' ? null : <><span style={label}>{pick('描述', 'Description')}</span><p style={{ margin: 0 }}>{latest.description}</p></>}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="dv-canvas-btn" style={button} onClick={() => { host.pickAssets(references, addReferences) }}>{pick('＋ 添加素材', '+ Add asset')}</button>
      </div>
    </div>
  )
}
