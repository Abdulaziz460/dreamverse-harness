// @vitest-environment jsdom
/**
 * The center targets: `dvCenter.show` switches the center view and keeps each view's latest numbered target,
 * `dvCenter.note` records a view's target under its kept serial, the URL hash carries the shown view's target so a
 * reload hands it back, a hash of plain fields names the shown view's target, the targets' string fields narrow the
 * project summary, Back re-hands only a changed target, a project switch drops the targets, and `dvCenter` leaves with
 * the shell plugin.
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

describe('the center targets', () => {
  it('shows a view with its target, numbers each target, and keeps the latest target of every view', async () => {
    const store = await loadStore('#project=p1')
    store.showInCenter({ view: 'timeline', target: { timeline: 't2', clip: null } })
    store.showInCenter({ view: 'canvas', target: { record: 'g1' } })
    store.showInCenter({ view: 'canvas', target: { record: 'g1' } })
    const { view, targets } = store.getShell()
    expect(view).toBe('canvas')
    expect(targets['timeline']?.value).toEqual({ timeline: 't2', clip: null })
    expect(targets['canvas']?.value).toEqual({ record: 'g1' })
    // A repeat of one target is a new request.
    expect((targets['canvas']?.serial ?? 0) > (targets['timeline']?.serial ?? 0)).toBe(true)
    const first = targets['canvas']?.serial
    store.showInCenter({ view: 'canvas', target: { record: 'g1' } })
    expect(store.getShell().targets['canvas']?.serial).not.toBe(first)
  })

  it('writes the shown view\'s target into the URL, and a reload of that URL hands the view its target', async () => {
    const store = await loadStore('#project=p1')
    store.startUrlMirror()
    store.showInCenter({ view: 'timeline', target: { timeline: 't2' } })
    const hash = window.location.hash
    expect(store.parseLocation(hash)).toEqual({ projectId: 'p1', view: 'timeline', target: { timeline: 't2' }, sessionId: undefined })
    const reloaded = await loadStore(hash)
    const shell = reloaded.getShell()
    expect([shell.projectId, shell.view, shell.targets['timeline']?.value]).toEqual(['p1', 'timeline', { timeline: 't2' }])
  })

  it('names no target for a view without one, and reads a malformed target field as none', async () => {
    const store = await loadStore('#project=p1&view=canvas&target=%7Bnot-json')
    expect(store.getShell().targets).toEqual({})
    expect(store.formatLocation({ projectId: 'p1', view: 'canvas', target: null, sessionId: undefined })).toBe('#project=p1')
  })

  it('re-hands a view a target from the URL only when its value changed', async () => {
    const store = await loadStore('#project=p1&view=timeline&target=%7B%22timeline%22%3A%22t2%22%7D')
    const kept = store.getShell().targets['timeline']?.serial
    store.showLocation('timeline', { timeline: 't2' })
    expect(store.getShell().targets['timeline']?.serial).toBe(kept)
    store.showLocation('canvas', null)
    expect([store.getShell().view, store.getShell().targets['timeline']?.serial]).toEqual(['canvas', kept])
    store.showLocation('timeline', { timeline: 't3' })
    expect(store.getShell().targets['timeline']?.value).toEqual({ timeline: 't3' })
    expect(store.getShell().targets['timeline']?.serial).not.toBe(kept)
  })

  it('notes a view\'s target under the serial it was last handed, and the URL shows a noted target of the shown view', async () => {
    const store = await loadStore('#project=p1&view=timeline')
    store.startUrlMirror()
    store.noteInCenter({ view: 'timeline', target: { timeline: 't2' } })
    expect(store.getShell().targets['timeline']).toEqual({ value: { timeline: 't2' }, serial: 0 })
    expect(store.parseLocation(window.location.hash).target).toEqual({ timeline: 't2' })
    store.showInCenter({ view: 'timeline', target: { timeline: 't3' } })
    const shown = store.getShell().targets['timeline']?.serial
    store.noteInCenter({ view: 'timeline', target: { timeline: 't1' } })
    expect(store.getShell().targets['timeline']).toEqual({ value: { timeline: 't1' }, serial: shown })
    expect(store.getShell().view).toBe('timeline')
  })

  it('reads the plain fields of a hash without a target field as the shown view\'s target, as a link such as timeline=t2 names it', async () => {
    const store = await loadStore('#project=p1&view=timeline&timeline=t2&session=s5')
    expect(store.getShell().targets['timeline']?.value).toEqual({ timeline: 't2' })
    expect(store.parseLocation('#project=p1').target).toBeNull()
  })

  it('narrows the project summary by the string fields of every view\'s target', async () => {
    const store = await loadStore('#project=p1')
    expect(store.summaryFields({})).toEqual({})
    store.showInCenter({ view: 'canvas', target: { record: 'g1' } })
    store.noteInCenter({ view: 'timeline', target: { timeline: 't2', clip: null } })
    store.noteInCenter({ view: 'other', target: ['t9'] })
    expect(store.summaryFields(store.getShell().targets)).toEqual({ record: 'g1', timeline: 't2' })
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

  it('drops the targets when another project opens', async () => {
    const store = await loadStore('#project=p1')
    store.showInCenter({ view: 'timeline', target: { timeline: 't2' } })
    store.setShell({ projectId: 'p2' })
    expect(store.getShell().targets).toEqual({})
  })
})

describe('dvCenter', () => {
  it('is provided by the shell plugin, moves the center, and leaves with the plugin', async () => {
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
    expect(store.getShell().view).toBe('timeline')
    expect(store.getShell().targets['timeline']?.value).toEqual({ timeline: 't1' })
    center?.note({ view: 'canvas', target: { record: 'g1' } })
    expect([store.getShell().view, store.getShell().targets['canvas']?.value]).toEqual(['timeline', { record: 'g1' }])
    await shell.dispose()
    expect(runtime.ctx.get('dvCenter')).toBeUndefined()
    await runtime.dispose()
  })
})
