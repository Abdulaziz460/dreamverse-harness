/** The descriptor registry that plugin UI halves register into: one owner per key, a stable list, and disposal. */
import { describe, expect, it, vi } from 'vitest'
import { createRegistry } from '../src/client/registries.ts'

interface Row { match: string }

describe('createRegistry', () => {
  it('lists descriptors in registration order and keeps the same array until a change', () => {
    const rows = createRegistry<Row>(row => [row.match])
    const empty = rows.list()
    expect(rows.list()).toBe(empty)
    const story = { match: 'story.approve' }
    rows.register(story)
    rows.register({ match: 'timeline.' })
    expect(rows.list()).not.toBe(empty)
    expect(rows.list().map(row => row.match)).toEqual(['story.approve', 'timeline.'])
    expect(rows.list()).toBe(rows.list())
  })

  it('refuses a key that another descriptor holds', () => {
    const rows = createRegistry<Row>(row => [row.match])
    rows.register({ match: 'story.approve' })
    expect(() => rows.register({ match: 'story.approve' })).toThrow('registry key "story.approve" is already registered')
    expect(rows.list()).toHaveLength(1)
  })

  it('removes a descriptor on disposal, once, and frees its key', () => {
    const rows = createRegistry<Row>(row => [row.match])
    const listener = vi.fn()
    const unsubscribe = rows.subscribe(listener)
    const dispose = rows.register({ match: 'story.approve' })
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
    dispose()
    expect(rows.list()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    rows.register({ match: 'story.approve' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(rows.list()).toHaveLength(1)
  })
})
