/**
 * The canvas as a view of the workspace center (`dv.center.view`): a {@link CanvasView} of the project and chat session
 * that the center passes, whose editors render the slots that this entry declares: the `dv.canvas.editor` entries of the
 * node entries, and the asset pool's `dv.canvas.picker` and `dv.canvas.preview` entries. The view opens the node of the
 * record that the center's request names (`{ record }`, as History shows a record).
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CenterRequest } from '@dv/ui-shell/contract'
import type { CanvasInjected } from './CanvasBody.tsx'
import { CanvasView } from './CanvasView.tsx'
import type { CanvasFocus } from './CanvasView.tsx'

/** The entry's composed props: the center's project, chat session and request, the API client, the registries, and the
 *  editor slots. */
export type CanvasCenterProps = PropsRuntime<'dv.center.view'> & CanvasInjected
  & PropsRenderSlots<'dv.canvas.editor' | 'dv.canvas.picker' | 'dv.canvas.preview'>

/**
 * The center view.
 * @param props - the project, chat session and request that the center passes, the client and registries that the
 *   plugin injects, and the `renderSlot` of the editor slots.
 * @returns the element.
 */
export function CanvasCenter({ projectId, session, request, client, canvas, renderSlot }: CanvasCenterProps): ReactNode {
  const focus = useMemo(() => focusOf(request), [request])
  return (
    <CanvasView
      projectId={projectId} session={session} client={client} canvas={canvas} renderSlot={renderSlot} focus={focus}
    />
  )
}

/**
 * @param request - the request that the center handed the canvas.
 * @returns the record to open with the request's `take`, or null for no request or one that names no record.
 */
function focusOf(request: CenterRequest | null): CanvasFocus | null {
  const record = request?.value['record']
  return request === null || typeof record !== 'string' ? null : { record, take: request.take }
}
