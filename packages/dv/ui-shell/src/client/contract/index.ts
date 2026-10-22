/**
 * The shell's surface contract: the slots that `@dv/ui-shell` declares for other UI plugins. Types only.
 *
 * @module @dv/ui-shell/contract
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One tab of the entry page's 探索 section, such as MCP tools, workflows, or skills: `label` names the tab, `order`
     * places it, and the component is the tab's body. The shell draws the tab row and renders only the selected tab;
     * the section is hidden while the slot has no entry. Declared by the `@dv/ui-shell` center entry.
     */
    'dv.explore': { kind: 'list'; scope: 'root' }
  }
}
