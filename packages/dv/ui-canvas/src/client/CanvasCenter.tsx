/**
 * The canvas as a view of the workspace center (`dv.center.view`): a {@link CanvasView} of the project and chat session
 * that the center passes, whose editors render the slots that this entry declares: the `dv.canvas.editor` entries of the
 * seeds, and the asset pool's `dv.canvas.picker` and `dv.canvas.preview` entries.
 */
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasInjected } from './CanvasBody.tsx'
import { CanvasView } from './CanvasView.tsx'

/** The entry's composed props: the center's project and chat session, the API client, the registries, and the editor slots. */
export type CanvasCenterProps = PropsRuntime<'dv.center.view'> & CanvasInjected
  & PropsRenderSlots<'dv.canvas.editor' | 'dv.canvas.picker' | 'dv.canvas.preview'>

/**
 * The center view.
 * @param props - the project and chat session that the center passes, the client and registries that the plugin
 *   injects, and the `renderSlot` of the editor slots.
 * @returns the element.
 */
export function CanvasCenter({ projectId, session, client, canvas, renderSlot }: CanvasCenterProps): ReactNode {
  return <CanvasView projectId={projectId} session={session} client={client} canvas={canvas} renderSlot={renderSlot} />
}
