// @vitest-environment jsdom
/**
 * The center of the open project: `dvCenter.show` switches the center view and hands it a request until the view takes
 * it, a view's `note` sets the project's center fields, the URL hash carries the center fields as plain fields so a
 * reload and an old `timeline=` link hand them back, another view or project drops a request, another project starts
 * without fields, and `dvCenter` leaves with the shell plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  window.history.replaceState(null, '', '/')
})

/**
 * Load a fresh copy of the shell store for a page opened at a hash.
 * @param hash - the URL hash the page loads with.
 * @returns the store module.
 */
async function loadStore(hash: string) {
  window.history.replaceState(null, '', `/${hash}`)
  vi.resetModules()
  return import('../src/client/store.ts')
}

describe('the center of the open project', () => {
  it('shows a view with a request until the view takes it, and keeps a later request when an earlier one is taken', async () => {
    const store = await loadStore('#project=p1')
    store.showInCenter({ view: 'timeline', target: { timeline: 't2', clip: null } })
    const first = store.getShell().request
    expect([store.getShell().view, first?.view, first?.request.value]).toEqual(['timeline', 'timeline', { timeline: 't2', clip: null }])
    store.showInCenter({ view: 'timeline', target: { timeline: 't2', clip: null } })
    const second = store.getShell().request
    expect(second).not.toBe(first)
    first?.request.take()
    expect(store.getShell().request).toBe(second)
    second?.request.take()
    expect(store.getShell().request).toBeNull()
  })

  it('drops a request that its view has not taken when another view or another project is shown', async () => {
    const store = await loadStore('#project=p1')
    store.showInCenter({ view: 'canvas', target: { record: 'g1' } })
    store.setShell({ view: 'timeline' })
    expect(store.getShell().request).toBeNull()
    store.showInCenter({ view: 'canvas', target: { record: 'g1' } })
    store.setShell({ sessionId: 's1' })
    expect(store.getShell().request?.request.value).toEqual({ record: 'g1' })
    store.setShell({ projectId: 'p2' })
    expect(store.getShell().request).toBeNull()
  })

  it('sets and removes center fields of the open project, writes them into the URL, and ignores a note of a project that is not open', async () => {
    const store = await loadStore('#project=p1&view=timeline')
    store.startUrlMirror()
    store.noteInCenter('p1', { timeline: 't2' })
    expect(window.location.hash).toBe('#project=p1&view=timeline&timeline=t2')
    store.noteInCenter('p2', { timeline: 't3' })
    expect(store.getShell().fields).toEqual({ timeline: 't2' })
    store.noteInCenter('p1', { timeline: null })
    expect([store.getShell().fields, window.location.hash]).toEqual([{}, '#project=p1&view=timeline'])
  })

  it('reads the plain fields of the URL hash as the center fields, so a reload and an old link hand them back', async () => {
    const store = await loadStore('#project=p1&timeline=t2&session=s5')
    expect(store.getShell().fields).toEqual({ timeline: 't2' })
    expect(store.parseLocation('#project=p1')).toEqual({ projectId: 'p1', view: 'canvas', fields: {}, sessionId: undefined })
    expect(store.formatLocation({ projectId: 'p1', view: 'timeline', fields: { timeline: 't2' }, sessionId: 's5' }))
      .toBe('#project=p1&view=timeline&timeline=t2&session=s5')
    expect(store.formatLocation({ projectId: null, view: 'timeline', fields: { timeline: 't2' }, sessionId: undefined })).toBe('')
  })

  it('shows the view and the center fields that a URL names', async () => {
    const store = await loadStore('#project=p1')
    store.showLocation({ view: 'timeline', fields: { timeline: 't3' } })
    expect([store.getShell().view, store.getShell().fields]).toEqual(['timeline', { timeline: 't3' }])
  })

  it('adds a browser history entry for a session the user chose, and replaces the entry for a session the shell opened', async () => {
    const store = await loadStore('#project=p1')
    store.startUrlMirror()
    const entries = window.history.length
    store.setShell({ sessionId: 's1' })
    expect([window.location.hash, window.history.length]).toEqual(['#project=p1&session=s1', entries])
    store.markSessionChoice()
    store.setShell({ sessionId: 's2' })
    expect([window.location.hash, window.history.length]).toEqual(['#project=p1&session=s2', entries + 1])
    // The choice covers the next session change only.
    store.setShell({ sessionId: 's3' })
    expect([window.location.hash, window.history.length]).toEqual(['#project=p1&session=s3', entries + 1])
  })

  it('starts another project without center fields', async () => {
    const store = await loadStore('#project=p1&timeline=t2')
    store.setShell({ projectId: 'p2' })
    expect(store.getShell().fields).toEqual({})
    store.setShell({ projectId: 'p3', fields: { timeline: 't1' } })
    expect(store.getShell().fields).toEqual({ timeline: 't1' })
  })
})

describe('dvCenter', () => {
  it('is provided by the shell plugin, shows a view with a request, and leaves with the plugin', async () => {
    vi.stubGlobal('fetch', scriptedFetch({ post: () => ({ status: 200, body: {} }) }).fetch)
    const { apply, inject } = await import('../src/client/index.ts')
    const store = await import('../src/client/store.ts')
    const runtime = await SlotTestRuntime.create()
    runtime.ctx.provide('sidebarRightTabs', new SidebarRightTabRegistry(runtime.ctx) as never)
    runtime.ctx.provide('sidebarRight', { openTab: () => {} } as never)
    runtime.ctx.provide('uiWorkspace', {} as never)
    runtime.ctx.provide('locale', { dicts: new Map(), subscribe: () => () => {} } as never)
    const shell = await runtime.mount({ inject: [...inject], apply })
    const center = runtime.ctx.get('dvCenter')
    expect(center).toBeDefined()
    center?.show({ view: 'timeline', target: { timeline: 't1' } })
    expect([store.getShell().view, store.getShell().request?.request.value]).toEqual(['timeline', { timeline: 't1' }])
    await shell.dispose()
    expect(runtime.ctx.get('dvCenter')).toBeUndefined()
    await runtime.dispose()
  })
})
