/**
 * The `dvCanvas` service that the canvas provides: its four registries, and the chain anchor of plan approvals.
 *
 * @module @dv/ui-canvas/dv-canvas
 */
import { createRegistry } from '@dv/ui-kit/registries.ts'
import type { ChainAnchor, DvCanvas, NodeKind, TakesInUse, VersionKind } from '@dv/ui-kit/registries.ts'

/**
 * Create empty canvas registries.
 * @returns the registries, each keyed as `DvCanvas` documents.
 */
export function createDvCanvas(): DvCanvas {
  return {
    nodeKinds: createRegistry<NodeKind>(kind => [kind.id]),
    chainAnchors: createRegistry<ChainAnchor>(anchor => [anchor.starter]),
    takesInUse: createRegistry<TakesInUse>(uses => [uses.id]),
    versionKinds: createRegistry<VersionKind>(kind => [kind.kind]),
  }
}

/** The node ID prefix of a plan, as `buildCanvasGraph` writes it. */
const PLAN_NODE = 'plan:'

/**
 * The chain anchor of plan approvals: a `plan.approve` record hangs the records it started off the node of its plan,
 * and the approved versions of a plan are those whose `approved_by` names an approval.
 */
export const planApprovalAnchor: ChainAnchor = {
  starter: 'plan.approve', // dv-arch-allow R5: transition until W4
  anchor: record => PLAN_NODE + String(record.params['plan']), // dv-arch-allow R5: transition until W4
  approvedVersions: (state, anchorId) => anchorId.startsWith(PLAN_NODE)
    ? (state.components.plan.plans[anchorId.slice(PLAN_NODE.length)] ?? []) // dv-arch-allow R5: transition until W4
      .filter(version => version.approved_by !== null).map(version => version.version)
    : [],
}
