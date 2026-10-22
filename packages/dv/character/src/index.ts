/**
 * The character component of DreamVerse as the `dvCharacter` Cordis service, declared on `@dv/reference-kit`: the
 * `character` slice, reference kind, operations `character.create` and `character.update` (agent tools
 * `dv_character_create` and `dv_character_update`) and skill.
 *
 * @module @dv/character
 */
import { defineReference } from '@dv/reference-kit'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The character component: people who must look the same across shots. */
    dvCharacter: DvCharacter
  }
}

/** The character component: people who must look the same across shots. */
export default class DvCharacter extends defineReference({
  service: 'dvCharacter',
  component: 'character',
  noun: { zh: '角色', en: 'character' },
  meaning: 'a person who must look the same across shots',
  reference: { reference: { type: 'image', many: true, description: 'The reference images of the version, in order.' } },
  skill: {
    description: 'How to create and update characters and their reference images, with the required arguments.',
    whenToUse: 'The user wants a person kept the same across shots, or changed.',
    file: new URL('../skills/character/SKILL.md', import.meta.url),
  },
}) {}
