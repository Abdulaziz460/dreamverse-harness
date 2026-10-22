/** Which reference assets of a shot the video model numbers as Picture N. */
import { describe, expect, it } from 'vitest'
import { asset } from '../../ui-kit/tests/fixture.client.tsx'
import { isPicture } from '../src/client/picture.ts'

describe('isPicture', () => {
  it('numbers images only', () => {
    expect([asset('a.png', 'image/png', null), asset('b.mp4', 'video/mp4', null), asset('c.wav', 'audio/wav', null)].map(isPicture))
      .toEqual([true, false, false])
  })
})
