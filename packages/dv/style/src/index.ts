/**
 * The style component of DreamVerse as the `dvStyle` Cordis service, declared on `@dv/reference-kit`: the `style`
 * slice, reference kind, operations `style.create` and `style.update` (agent tools `dv_style_create` and
 * `dv_style_update`) and skill.
 *
 * @module @dv/style
 */
import { defineReference } from '@dv/reference-kit'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The style component: reusable visual looks. */
    dvStyle: DvStyle
  }
}

/** The style component: reusable visual looks. */
export default class DvStyle extends defineReference({
  service: 'dvStyle',
  component: 'style',
  noun: { zh: '风格', en: 'style' },
  meaning: 'a reusable visual look',
  reference: { reference: { type: 'image', many: true, description: 'The reference images of the version, in order.' } },
  skill: {
    description: 'How to create and update styles and their reference images, with the required arguments.',
    whenToUse: 'The user names a look, such as film grain, a palette or a lens, or wants it changed.',
    file: new URL('../skills/style/SKILL.md', import.meta.url),
  },
}) {}
