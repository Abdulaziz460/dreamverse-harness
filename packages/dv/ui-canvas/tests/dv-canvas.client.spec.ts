/** The canvas registries and the chain anchor of plan approvals. */
import { describe, expect, it } from 'vitest'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { fixtureState, record } from '../../ui-kit/tests/fixture.client.tsx'
import { createDvCanvas, planApprovalAnchor } from '../src/client/dv-canvas.ts'

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
    const props = { kind: 'prop', node: (id: string) => `prop:${id}`, latest: () => [], name: () => null, assets: () => [] }
    canvas.versionKinds.register(props)
    expect(() => canvas.versionKinds.register({ ...props })).toThrow('registry key "prop"')
  })
})

describe('planApprovalAnchor', () => {
  it('hangs an approval off the node of its plan', () => {
    const approval = record({ id: 'a1', operation: 'plan.approve', params: { plan: 'p1', version: 1 } })
    expect(planApprovalAnchor.starter).toBe('plan.approve')
    expect(planApprovalAnchor.anchor(approval)).toBe('plan:p1')
  })

  it('lists the versions of a plan whose approved_by names an approval', () => {
    const state = fixtureState()
    const shots: never[] = []
    state.components.plan.plans = {
      p1: [
        { version: 1, shots, created_by: 'q1', approved_by: 'a1' },
        { version: 2, shots, created_by: 'q2', approved_by: null },
        { version: 3, shots, created_by: 'q3', approved_by: 'a3' },
      ],
    }
    expect(planApprovalAnchor.approvedVersions?.(state, 'plan:p1')).toEqual([1, 3])
    expect(planApprovalAnchor.approvedVersions?.(state, 'plan:p9')).toEqual([])
    expect(planApprovalAnchor.approvedVersions?.(state, 'xxxxxp1')).toEqual([])
  })
})
