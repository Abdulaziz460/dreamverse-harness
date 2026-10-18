// @vitest-environment jsdom
/**
 * The canvas as a right-Sidebar tab body: the body declares no canvas slot and passes no slot renderer, so a seed editor
 * there opens with only its header, the asset picker lists only the versioned items, and an asset chip opens no preview,
 * each with no error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DvClient } from '@dv/ui-kit/api.ts'
import type { NodeKind } from '@dv/ui-kit/registries.ts'
import { bibleVersionKinds } from '@dv/ui-story-bible/src/client/index.ts'
import { fixtureState, scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { CanvasBody } from '../src/client/CanvasBody.tsx'
import type { CanvasBodyProps } from '../src/client/CanvasBody.tsx'
import { createDvCanvas } from '../src/client/dv-canvas.ts'
import { EDITOR_RECT_KEY } from '../src/client/NodeEditor.tsx'
import type { CanvasTranslate } from '../src/client/NodeCard.tsx'
import { zh } from '../src/client/locales.ts'

/** A node kind as a plugin's UI half registers it: one seed. */
const PROPS: NodeKind = {
  id: '@dv/ui-prop', kind: 'prop', label: () => '道具', color: 'rgb(1, 2, 3)', column: 1,
  nodes: () => [{ id: 'prop:p1', record: null, title: '红伞', media: [] }],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.removeItem(EDITOR_RECT_KEY)
  window.localStorage.removeItem('dv-canvas-seen:p1')
})

describe('canvas tab body', () => {
  it('opens a seed editor with its header and no slot body, without an error', async () => {
    const canvas = createDvCanvas()
    canvas.nodeKinds.register(PROPS)
    const t: CanvasTranslate = makeTranslate(zh)
    // The slot runtime hands `renderSlot` only to an entry that declares children, so the body gets none in the right
    // Sidebar either; it reads only its client, its registries and its copy.
    const props = { client: new DvClient(scriptedFetch().fetch), canvas, t } as CanvasBodyProps
    const { container } = render(<CanvasBody {...props} />)
    const card = await waitFor(() => {
      const node = container.querySelector('[data-node-id="prop:p1"]')
      expect(node).not.toBeNull()
      return node as HTMLElement
    })

    fireEvent.pointerDown(card, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(container.querySelector('[data-testid="dv-canvas-view"]') as HTMLElement, { pointerId: 1 })
    const editor = await waitFor(() => within(container).getByTestId('dv-canvas-node-editor'))
    expect(within(editor).getByRole('heading').textContent).toBe('红伞')
    expect(within(container).getByTestId('dv-canvas-body')).toBeTruthy()
  })

  it('opens the asset picker with only the versioned items, and an asset chip with no preview, without an error', async () => {
    const errors = vi.spyOn(console, 'error')
    // The first take also references an asset, so its editor shows an asset chip beside the character chip; a location
    // that the take does not reference is a versioned item of the picker.
    const state = fixtureState()
    state.components.proj.records = state.components.proj.records.map(entry => entry.id === 'g1'
      ? { ...entry, inputs: [...entry.inputs, { role: 'reference', ref: { asset: 'shot2-last.png' }, resolved_asset: 'shot2-last.png' }] }
      : entry)
    state.components.bible.locations['alley'] = [{ id: 'alley', version: 1, name: 'Alley', description: '', references: ['ref.png'], created_by: 'e1' }]
    const canvas = createDvCanvas()
    for (const kind of bibleVersionKinds) canvas.versionKinds.register(kind)
    const t: CanvasTranslate = makeTranslate(zh)
    const props = { client: new DvClient(scriptedFetch({ state }).fetch), canvas, t } as CanvasBodyProps
    const view = render(<CanvasBody {...props} />)
    const card = await waitFor(() => {
      const node = view.container.querySelector('[data-node-id="g1"]')
      expect(node).not.toBeNull()
      return node as HTMLElement
    })
    fireEvent.pointerDown(card, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(view.getByTestId('dv-canvas-view'), { pointerId: 1 })
    const editor = await waitFor(() => view.getByTestId('dv-canvas-node-editor'))

    fireEvent.click(within(editor).getByText(zh['editor.addAsset']))
    const picker = await view.findByTestId('dv-canvas-asset-picker')
    expect(within(picker).getByRole('button', { name: 'Alley' })).toBeTruthy()
    expect(picker.querySelector('[data-asset-id]')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(view.queryByTestId('dv-canvas-asset-picker')).toBeNull()
    fireEvent.click(within(editor).getByRole('button', { name: '查看 shot2-last.png' }))
    expect(view.queryByRole('dialog', { name: 'shot2-last.png' })).toBeNull()
    expect(view.getByTestId('dv-canvas-node-editor')).toBeTruthy()
    expect(errors).not.toHaveBeenCalled()
  })
})
