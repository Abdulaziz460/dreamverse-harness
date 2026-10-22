/**
 * The History contract: how a UI plugin names and focuses the records of its operations in the History panel.
 * `@dv/ui-history` provides `dvHistory`; each kind's plugin registers its rows. Types only.
 *
 * @module @dv/ui-history/contract
 */
import type {} from '@deepseek-ai/cordis'
import type { Registry } from '@dv/ui-kit/registries.ts'
import type { ProjectRecord } from '@dv/ui-kit/types.ts'
import type { CenterTarget } from '@dv/ui-shell/contract'

/** A pair of interface texts, Chinese then English. */
export type Text = readonly [zh: string, en: string]

/** How History names the records of one operation or component key. Registry `dvHistory.rows`, keyed by `match`. */
export interface HistoryRow {
  /** An operation name, or '<key>.' for every operation of a component key. */
  match: string
  /** The subject after the label, with its own separator, such as [' p1 v1', ' p1 v1']; null for none. */
  subject(record: ProjectRecord): Text | null
  /**
   * Where selecting the record moves the center, given the records of the current state (oldest first); absent: the
   * record's canvas node (`{ view: 'canvas', target: { record } }`).
   */
  focus?(record: ProjectRecord, records: readonly ProjectRecord[]): CenterTarget | null
}

/** Provided by `@dv/ui-history` as `ctx.dvHistory`. */
export interface DvHistory {
  /** Keyed by `match`. */
  rows: Registry<HistoryRow>
}

declare module '@deepseek-ai/cordis' {
  interface Context { dvHistory: DvHistory }
}
