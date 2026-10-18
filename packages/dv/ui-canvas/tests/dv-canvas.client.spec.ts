/** The canvas registries. */
import { describe, expect, it } from 'vitest'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { createDvCanvas } from '../src/client/dv-canvas.ts'

describe('createDvCanvas', () => {
  it('creates four empty registries, each refusing a second descriptor with the same key', () => {
    const canvas = createDvCanvas()
    const registries = [canvas.nodeKinds, canvas.chainAnchors, canvas.takesInUse, canvas.versionKinds]
    expect(registries.map(registry => registry.list())).toEqual([[], [], [], []])
    const kind: NodeKind = { id: '@dv/ui-prop', kind: 'prop', label: () => '道具', color: '#888', column: 0, nodes: () => [] }
    canvas.nodeKinds.register(kind)
    expect(() => canvas.nodeKinds.register({ ...kind, kind: 'other' })).toThrow('registry key "@dv/ui-prop" is already registered')
    canvas.chainAnchors.register({ starter: 'story.approve', anchor: () => 'plan:p1' })
    expect(() => canvas.chainAnchors.register({ starter: 'story.approve', anchor: () => 'plan:p2' })).toThrow('registry key "story.approve"')
    canvas.takesInUse.register({ id: '@dv/ui-prop', uses: () => [] })
    expect(() => canvas.takesInUse.register({ id: '@dv/ui-prop', uses: () => ['r1'] })).toThrow('registry key "@dv/ui-prop"')
    const props = { kind: 'prop', label: () => '道具', node: (id: string) => `prop:${id}`, latest: () => [], name: () => null, assets: () => [] }
    canvas.versionKinds.register(props)
    expect(() => canvas.versionKinds.register({ ...props })).toThrow('registry key "prop"')
  })
})
