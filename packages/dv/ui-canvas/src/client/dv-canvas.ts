/**
 * The `dvCanvas` service that the canvas provides: its four registries.
 *
 * @module @dv/ui-canvas/dv-canvas
 */
import { createRegistry } from '@dv/ui-kit/registries.ts'
import type { ChainAnchor, DvCanvas, NodeType, TakesInUse, VersionKind } from '@dv/ui-kit/registries.ts'

/**
 * Create empty canvas registries.
 * @returns the registries, each keyed as `DvCanvas` documents.
 */
export function createDvCanvas(): DvCanvas {
  return {
    nodeTypes: createRegistry<NodeType>(type => [type.id]),
    chainAnchors: createRegistry<ChainAnchor>(anchor => [anchor.starter]),
    takesInUse: createRegistry<TakesInUse>(uses => [uses.id]),
    versionKinds: createRegistry<VersionKind>(kind => [kind.kind]),
  }
}
