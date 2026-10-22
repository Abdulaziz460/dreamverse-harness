/**
 * The canvas as a view of the workspace center (`dv.center.view`): a {@link CanvasView} of the project and chat session
 * that the center passes, whose editors render the slots that this entry declares: the `dv.canvas.editor` entries of the
 * node entries, and the asset pool's `dv.canvas.picker` and `dv.canvas.preview` entries. The view opens the node of the
 * record that the center's target names (`{ record }`, as History shows a record).
 */
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ViewTarget } from '@dv/ui-shell/contract'
import type { CanvasInjected } from './CanvasBody.tsx'
import { CanvasView } from './CanvasView.tsx'
import type { CanvasFocus } from './CanvasView.tsx'

/** The entry's composed props: the center's project, chat session and target, the API client, the registries, and the
 *  editor slots. */
export type CanvasCenterProps = PropsRuntime<'dv.center.view'> & CanvasInjected
  & PropsRenderSlots<'dv.canvas.editor' | 'dv.canvas.picker' | 'dv.canvas.preview'>

/**
 * The center view.
 * @param props - the project, chat session and target that the center passes, the client and registries that the
 *   plugin injects, and the `renderSlot` of the editor slots.
 * @returns the element.
 */
export function CanvasCenter({ projectId, session, target, client, canvas, renderSlot }: CanvasCenterProps): ReactNode {
  return (
    <CanvasView
      projectId={projectId} session={session} client={client} canvas={canvas} renderSlot={renderSlot} focus={focusOf(target)}
    />
  )
}

/**
 * @param target - the target that the center handed the canvas; it may come from the URL.
 * @returns the record to open, or null for a target that names none.
 */
function focusOf(target: ViewTarget | null): CanvasFocus | null {
  const value = target?.value
  if (target === null || typeof value !== 'object' || value === null || Array.isArray(value) || !('record' in value)) return null
  const record = value.record
  return typeof record === 'string' ? { record, serial: target.serial } : null
}
