/**
 * The location component of DreamVerse as the `dvLocation` Cordis service, declared on `@dv/reference-kit`: the
 * `location` slice, reference kind, operations `location.create` and `location.update` (agent tools
 * `dv_location_create` and `dv_location_update`) and skill.
 *
 * @module @dv/location
 */
import { defineReference } from '@dv/reference-kit'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The location component: places shots happen in. */
    dvLocation: DvLocation
  }
}

/** The location component: places shots happen in. */
export default class DvLocation extends defineReference({
  service: 'dvLocation',
  component: 'location',
  noun: { zh: '场景', en: 'location' },
  meaning: 'a place shots happen in',
  reference: { reference: { type: 'image', many: true, description: 'The reference images of the version, in order.' } },
  skill: {
    description: 'How to create and update locations and their reference images, with the required arguments.',
    whenToUse: 'One place must stay the same across shots, or the user wants it changed.',
    file: new URL('../skills/location/SKILL.md', import.meta.url),
  },
}) {}
