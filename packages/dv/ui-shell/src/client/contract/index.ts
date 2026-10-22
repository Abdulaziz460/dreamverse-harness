/**
 * The shell's surface contract: the slots that `@dv/ui-shell` declares for other UI plugins, and the center service
 * that moves the workspace center to a view and a target in it. The shell names no view. Types only.
 *
 * @module @dv/ui-shell/contract
 */
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** JSON data. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

/** Where the center moves: a `dv.center.view` entry's ID and a JSON target that the view reads, such as a record. */
export interface CenterTarget { view: string; target: Json }

/** Provided by `@dv/ui-shell` as `ctx.dvCenter`. */
export interface DvCenter {
  /** Show the view of `target` in the workspace center and hand it the target; the view reads it when it mounts. */
  show(target: CenterTarget): void
  /**
   * Record the target of a view without showing the view or handing it a new target, such as the timeline that the user
   * picked in a view or in the right sidebar. The URL keeps the shown view's target, and the string fields of every
   * view's target narrow the open project's summary, such as the timeline whose first clip is the session cover.
   */
  note(target: CenterTarget): void
}

/** The target that the center handed one view: the latest `show` for it, numbered so a repeat of one target differs. */
export interface ViewTarget { value: Json; serial: number }

declare module '@deepseek-ai/cordis' {
  interface Context { dvCenter: DvCenter }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One tab of the entry page's 探索 section, such as MCP tools, workflows, or skills: `label` names the tab, `order`
     * places it, and the component is the tab's body. The shell draws the tab row and renders only the selected tab;
     * the section is hidden while the slot has no entry. Declared by the `@dv/ui-shell` center entry.
     */
    'dv.explore': { kind: 'list'; scope: 'root' }
    /**
     * One view of the open project, such as the canvas; `@dv/ui-shell` shows the selected entry in the workspace center
     * and hands it the latest target that `dvCenter.show` named for it, else null.
     */
    'dv.center.view': { kind: 'list'; scope: 'root'; owner: { projectId: string; session: string | null; target: ViewTarget | null } }
  }
}
