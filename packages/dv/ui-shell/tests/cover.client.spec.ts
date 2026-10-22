// @vitest-environment jsdom
/** Project card summaries: one `/api/dv/projects/summary` read for every card, or one project's on its selected timeline. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useProjectSummaries } from '../src/client/cover.tsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** Two project summaries as the route answers them. */
const SUMMARIES = [
  { project: 'p1', cover: { video: 'shot1.mp4', image: null }, edited_at: '2026-10-05T00:00:00Z' },
  { project: 'p2', cover: null, edited_at: null },
]

describe('useProjectSummaries', () => {
  it('reads every summary in one request, and reads again only when the refresh value changes', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(SUMMARIES))))
    vi.stubGlobal('fetch', fetchSpy)
    const { result, rerender } = renderHook(({ refresh }) => useProjectSummaries(null, refresh), { initialProps: { refresh: 'p1 p2' } })
    await waitFor(() => { expect(result.current?.get('p1')?.cover).toEqual({ video: 'shot1.mp4', image: null }) })
    expect(result.current?.get('p2')).toEqual(SUMMARIES[1])
    rerender({ refresh: 'p1 p2' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    rerender({ refresh: 'p1 p2 p3' })
    await waitFor(() => { expect(fetchSpy).toHaveBeenCalledTimes(2) })
    expect(fetchSpy.mock.calls.map(call => call[0])).toEqual(['/api/dv/projects/summary', '/api/dv/projects/summary'])
  })

  it('asks for one project\'s summary narrowed by the given fields, and again when the fields change', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(SUMMARIES.slice(0, 1)))))
    vi.stubGlobal('fetch', fetchSpy)
    const initialProps: { fields: Readonly<Record<string, string>> | undefined } = { fields: undefined }
    const { result, rerender } = renderHook(({ fields }) => useProjectSummaries('p1', null, fields), { initialProps })
    await waitFor(() => { expect(result.current?.get('p1')?.cover).toEqual({ video: 'shot1.mp4', image: null }) })
    rerender({ fields: { timeline: 't2' } })
    await waitFor(() => { expect(fetchSpy).toHaveBeenCalledTimes(2) })
    expect(fetchSpy.mock.calls.map(call => call[0]))
      .toEqual(['/api/dv/projects/summary?project=p1', '/api/dv/projects/summary?timeline=t2&project=p1'])
  })
})
