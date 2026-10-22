/** The rule that tells generation records apart: by the operation declaration on the wire, else by the record's facts. */
import { describe, expect, it } from 'vitest'
import { isGenerationOperation, isGenerationRecord } from '../src/client/state.ts'
import type { WireOperation } from '../src/client/types.ts'
import { OPERATIONS, record } from './fixture.client.tsx'

/**
 * A declaration with one output.
 * @param type - the output type.
 * @param changes - the fields that differ from a GPU operation that is not deterministic.
 * @returns the declaration.
 */
function declared(type: string, changes: Partial<WireOperation> = {}): WireOperation {
  return {
    name: `x.${type}`, version: '1', description: type, inputs: {}, params: {}, outputs: [{ role: type, type }],
    deterministic: false, resource: 'gpu', confirm: 'over_gpu_budget', ...changes,
  }
}

/** MIME types of the assets that the records below output. */
const MIMES: Record<string, string> = { 'cat.png': 'image/png', 'line.wav': 'audio/wav', 'cut.mp4': 'video/mp4', 'plan.json': 'application/json' }
const mimeOf = (asset: string): string | undefined => MIMES[asset]

describe('isGenerationOperation', () => {
  it('accepts a GPU operation that is not deterministic and outputs an image, a video or audio, of any name', () => {
    expect(['image', 'video', 'audio'].map(type => isGenerationOperation(declared(type)))).toEqual([true, true, true])
    expect(OPERATIONS.map(isGenerationOperation)).toEqual([true, false, false])
  })

  it('refuses a deterministic, CPU or media-free operation', () => {
    expect([
      declared('video', { deterministic: true }), declared('video', { resource: 'cpu' }), declared('json'), declared('video', { outputs: [] }),
    ].map(isGenerationOperation)).toEqual([false, false, false, false])
  })
})

describe('isGenerationRecord', () => {
  it('follows the declaration on the wire, so a running record without outputs counts', () => {
    const running = record({ id: 'r1', operation: 'x.video', deterministic: false, status: 'running' })
    expect(isGenerationRecord(running, declared('video'), mimeOf)).toBe(true)
    expect(isGenerationRecord(record({ id: 'r2', operation: 'x.video', outputs: ['cut.mp4'] }), declared('video', { resource: 'cpu' }), mimeOf))
      .toBe(false)
  })

  it('off the wire, accepts a record that is not deterministic and output media, and refuses the rest', () => {
    const offWire = (id: string, deterministic: boolean, outputs: string[]): boolean =>
      isGenerationRecord(record({ id, operation: 'shot.render_ref2va', deterministic, outputs }), undefined, mimeOf)
    expect([
      offWire('a', false, ['plan.json', 'cat.png']), offWire('b', false, ['line.wav']), offWire('c', false, ['cut.mp4']),
    ]).toEqual([true, true, true])
    expect([
      offWire('d', true, ['cut.mp4']), offWire('e', false, []), offWire('f', false, ['plan.json']), offWire('g', false, ['unknown.bin']),
    ]).toEqual([false, false, false, false])
  })
})
