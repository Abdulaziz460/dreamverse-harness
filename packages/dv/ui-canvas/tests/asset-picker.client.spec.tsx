// @vitest-environment jsdom
/** The asset picker: one section per registered version kind, titled with the kind's label. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DvClient } from '@dv/ui-kit/api.ts'
import type { VersionKind } from '@dv/ui-kit/registries.ts'
import { fixtureState, scriptedFetch } from '../../ui-kit/tests/fixture.client.tsx'
import { AssetPicker } from '../src/client/AssetPicker.tsx'
import { createDvCanvas } from '../src/client/dv-canvas.ts'
import type { CanvasTranslate } from '../src/client/NodeCard.tsx'
import { zh } from '../src/client/locales.ts'

/**
 * A version kind whose items all stand at version 1 with no reference asset.
 * @param kind - the reference kind.
 * @param label - the section title of its items.
 * @param names - item ID → its name.
 * @returns the version kind.
 */
function namedKind(kind: string, label: string, names: Record<string, string>): VersionKind {
  return {
    kind, label: () => label, node: id => `${kind}:${id}`,
    latest: () => Object.keys(names).map(id => ({ id, version: 1 })),
    name: (_state, id) => names[id] ?? null, assets: () => [],
  }
}

afterEach(() => { cleanup() })

describe('AssetPicker', () => {
  it('shows one section per registered version kind, titled with the kind\'s label and holding its items', () => {
    const canvas = createDvCanvas()
    canvas.versionKinds.register(namedKind('character', '角色', { hero: 'Hero' }))
    canvas.versionKinds.register(namedKind('prop', '道具', { p1: '红伞', p2: '旧皮箱' }))
    const t: CanvasTranslate = makeTranslate(zh)
    render(
      <AssetPicker
        state={fixtureState()} client={new DvClient(scriptedFetch().fetch)} project="p1" session={null} t={t}
        kinds={canvas.versionKinds.list()} chosen={[]} onConfirm={() => undefined} onCancel={() => undefined}
      />,
    )
    const picker = within(document.body).getByTestId('dv-canvas-asset-picker')
    const sections = [...picker.querySelectorAll('section')].map(section => ({
      title: section.querySelector('h3')?.textContent,
      items: within(section).getAllByRole('button').map(button => button.textContent),
    }))
    expect(sections).toEqual([{ title: '角色', items: ['Hero'] }, { title: '道具', items: ['红伞', '旧皮箱'] }])
  })
})
