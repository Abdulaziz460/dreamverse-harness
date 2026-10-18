/**
 * The canvas as a view of the workspace center (`dv.center.view`): a {@link CanvasView} of the project and chat session
 * that the center passes, whose seed editors render the `dv.canvas.editor` entries that this entry declares.
 */
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasInjected } from './CanvasBody.tsx'
import { CanvasView } from './CanvasView.tsx'

/** The entry's composed props: the center's project and chat session, the API client, the registries, and the editor slot. */
export type CanvasCenterProps = PropsRuntime<'dv.center.view'> & CanvasInjected & PropsRenderSlots<'dv.canvas.editor'>

/**
 * The center view.
 * @param props - the project and chat session that the center passes, the client and registries that the plugin
 *   injects, and the `renderSlot` of the editor slot.
 * @returns the element.
 */
export function CanvasCenter({ projectId, session, client, canvas, renderSlot }: CanvasCenterProps): ReactNode {
  return <CanvasView projectId={projectId} session={session} client={client} canvas={canvas} renderEditor={renderSlot} />
}
