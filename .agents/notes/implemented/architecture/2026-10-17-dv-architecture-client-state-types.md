# Agent Note: DreamVerse client state types — required slice merges and a partial wire view

Status: implemented

English | [中文](2026-10-17-dv-architecture-client-state-types.zh.md)

## Problem

Each DreamVerse component keeps its project data in one slice of the project state, and the server sends those slices to the browser in `WireState.components`; the [data flow note](2026-10-17-dv-architecture-data-flow.md) owns how the slices are computed and sent. Each UI package merges the type of its slice into the `ComponentStates` interface of `@dv/ui-kit/types.ts` as a required key, for example `character: CharacterState` in `packages/dv/ui-character/src/client/index.ts`. `WireState.components` had the type `ComponentStates`, so the type claimed that every merged slice was always present in the browser.

No run-time fact backed that claim. The bundle file `packages/bundle/dv/cordis.patch.yml` mounts a host plugin such as `@dv/character` and its UI plugin `@dv/ui-character` as two separate rows, and the UI plugin injects only the renderer `@deepseek-ai/dsh-client-ui-renderer`. The server builds a slice only for a component whose host plugin is loaded. The false claim had two effects:

- Reads that the compiler accepted threw at run time. `timelinesOf` in `packages/dv/ui-timeline/src/client/timelines.ts` returned `state.components.timeline.timelines`, which throws a `TypeError` when the server does not load `@dv/timeline`. Two reads of `state.components.plan.plans` in `packages/dv/ui-shot-plan/src/client/` and the `Object.entries` call on a noun slice in `packages/dv/ui-kit/src/client/reference-kit.tsx` had the same fault.
- Adding a reference noun edited a shared package. `fixtureState()` in `packages/dv/ui-kit/tests/fixture.client.tsx` returned a full `WireState` that the UI tests of every package share, so it had to list every merged key; it held `character`, `location: {}` and `style: {}`. A fourth noun, `prop`, with the same required client merge failed the root client type-check in that fixture with `TS2741: Property 'prop' is missing … but required in type 'ComponentStates'`. The available repairs were an edit to `@dv/ui-kit`, or an optional merge with `?? {}` in the noun's own package, which moved the false claim instead of removing it.

## Decision

Slice merges stay required on the host and on the client. The client wire view is partial. Each owner of a slice defines what its absence means, once.

**Declarations.** A host package declares its slice type in its client face (`<k>/src/types.ts`) and merges `<k>: <K>State` into `ComponentStates` of `@dv/project/types`. Its UI package merges the same required key into `ComponentStates` of `@dv/ui-kit/types.ts` (`ui-<k>/src/client/index.ts`). A merged member means "the type of slice `<k>` when the slice is present". The value type of a reference noun's `fields` entry is required as well, because the kit reducer in `packages/dv/reference-kit/src/index.ts` writes every declared field into every version.

**The wire view.** `packages/dv/ui-kit/src/client/types.ts` states presence in one type:

```
export type WireComponents = Pick<ComponentStates, 'proj' | 'asset'> & Partial<ComponentStates>
```

`WireState.components` has the type `WireComponents`. The `proj` slice and the `asset` slice are always present, because the `@dv/api` plugin that sends the state injects their owners `dvProject` and `dvAssetPool` (`static inject` in `packages/dv/api/src/index.ts`). Any other slice has the type `<K>State | undefined`.

**Absence.** In the browser, an absent slice is a real state: the server has not loaded the host plugin that owns it. The value of an absent slice is the owner's initial slice on the host, so a missing plugin and an empty slice draw the same view. Each owner writes that value in one accessor:

- `itemsOf(spec, state)`, defined as `spec.slice(state) ?? {}` in `packages/dv/ui-kit/src/client/reference-kit.tsx`, serves every reference noun. `newestOf`, `versionOf` and `ReferenceEditor` read through `itemsOf`. The value `{}` is the initial slice that `defineReference` gives a noun on the host, so a missing noun shows no canvas node, no `@` item and no version. `ReferenceUiSpec.slice` returns `… | undefined`, and a noun's `slice: state => state.components.character` takes that type with no edit in the noun package.
- `timelinesOf` in `packages/dv/ui-timeline/src/client/timelines.ts` returns `state.components.timeline?.timelines ?? []`.
- `plansOf` in `packages/dv/ui-shot-plan/src/client/PlanEditor.tsx` returns `state.components.plan?.plans ?? {}`. The canvas entries in `packages/dv/ui-shot-plan/src/client/index.ts` and the `PlanEditor` component both call `plansOf`.

A UI package whose host package has no client face reads its slice through the `[key: string]: unknown` index signature of the client `ComponentStates` and narrows the value with a type guard; `@dv/ui-workflow-story` reads the `story` slice this way with `isStorySlice`.

**Readers of several slices.** Generic client code, such as the canvas of `@dv/ui-canvas`, takes `WireState` and reads only `proj` and `asset`. It reads a noun only through the descriptors that the noun's owner registers, as the [UI registries note](2026-10-17-dv-architecture-ui-registries.md) describes. Every `state.components.<k>` read in `packages/dv/ui-*/src` sits in the package that owns `<k>`. A reader of named slices types them with `Pick`, and its caller proves that they are present: `SummarySource` in `packages/dv/api/src/summaries.ts` takes `Pick<ComponentStates, 'proj' | 'timeline'>`. The e2e type `WireState` in `packages/dv/e2e/tests/wire-state.ts` types the slices of a full bundle as present.

## The Cordis mapping

The model copies how Cordis types its services. Cordis declares a service once as a required member of `Context`, and the reader states whether the service is present:

| Cordis                                                                                                                                                                                                           | DreamVerse slice                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Context` augmentation: a required member such as `dvCharacter: DvCharacter` in `packages/dv/character/src/index.ts`                                                                                             | A required `ComponentStates` merge on the host and on the client                                                                                      |
| `inject`: a plugin "only loads while all are available" (`vendor/cordis/src/registry.ts`), and an access without it throws `cannot get property "…" without inject` (`vendor/cordis/src/reflect.ts`)             | A host owner's read of its own slice; in the browser, `proj` and `asset` (the `Pick` part of `WireComponents`)                                        |
| `ctx.get(name)`, typed `undefined \| this[K]` (`vendor/cordis/src/reflect.ts`); the reader defines absence at the read, as `this.ctx.get('dvModels')?.taskLabels() ?? {}` does in `packages/dv/api/src/index.ts` | Every other slice in the browser (the `Partial` part of `WireComponents`); the owner's accessor (`itemsOf`, `timelinesOf`, `plansOf`) defines absence |
| The `inject` list of a plugin names the services that it holds                                                                                                                                                   | `FixtureState` names the slices that the shared test state holds                                                                                      |

On the host, the reducer registry is the run-time fact behind presence: `reduceChain` in `packages/dv/project/src/reducers.ts` starts every registered slice from its reducer's initial slice, and `componentStates` asserts the full `ComponentStates` type once. In the browser, a slice is only a field of the JSON that the server sent, and the browser's Cordis instance does not know which host plugins the server loaded, so the client state takes the `ctx.get` form.

## Test fixtures

`fixtureState()` in `packages/dv/ui-kit/tests/fixture.client.tsx` returns `FixtureState`, defined as `WireState & { components: Pick<ComponentStates, 'plan' | 'timeline'> }`. It holds no noun slice. `withTestRef<S extends WireState>(state: S): S` adds the test noun and keeps the caller's type. The client test noun `test_ref` merges into `ComponentStates` as a required key in the same fixture file. A noun test assigns its whole slice, as `state.components.character = { [id]: [ … ] }` does in `packages/dv/ui-character/tests/ui-character.client.spec.tsx`. A client test literal lists only the slices that the test reads, with no cast. The case "draws no entry, @ item or version for a state without the slice of the noun" in `packages/dv/ui-kit/tests/reference-kit.client.spec.tsx` pins the absent-slice behavior of the kit.

A test-only key merged into the host `ComponentStates` stays optional, for example `test_ref?:` in `packages/dv/reference-kit/tests/support.ts` and `reducers_test?:` in `packages/dv/project/tests/reducers.spec.ts`. The root host type-check program holds every host test file, so a test key merged there reaches the host state type of every package.

## Alternatives considered

**An optional merge per noun, with `?? {}` at each read.** Each UI package writes `<k>?: <K>State` and `slice: state => state.components.<k> ?? {}`, and extra fields such as `traits` become optional. It lost because it puts presence on each declaration by convention: an author who forgets `?` compiles cleanly in the noun's own package and fails only in the `@dv/ui-kit` fixture, which is the failure that the Problem section describes. One key is then required on the host and optional on the client. The `plan` and `timeline` reads keep their run-time fault. An optional `traits?` claims that a field can be missing, while the kit reducer always writes it.

**The shared fixture lists every noun.** The merges stay required, and each added noun adds its empty slice to `fixtureState()`. It lost because every noun and every field then edits `@dv/ui-kit`, and the type still claims that every slice is present.

**The full type, an `Object.hasOwn` check in the kit, and a cast in the fixture.** `WireState.components` keeps the type `ComponentStates`, and the kit reads a noun slice only after `Object.hasOwn(state.components, spec.key)`. It lost because the type still claims presence: `timelinesOf` stays typed as present and still throws, and the fixture needs a cast.

**The kit reads the slice by `key`, with no `slice` function.** `defineReferenceUi` takes `key: K` constrained by a conditional `ReferenceKey` type and reads `state.components[spec.key]` itself. It is correct, but it needs the conditional type and one assertion in the kit. The merge already types the `slice` function, which needs neither, so the `slice` function won on simplicity.

**A separate `SliceTypes` map with `unknown` values.** The merges go into a `SliceTypes` interface, and `ComponentStates` keeps only `proj`, `asset` and `[key: string]: unknown`. It is honest and needs no assertion, but about 25 test reads and three source reads lose their types, and hand-written test slices lose their type check.

**One client type-check program per package.** Each UI package type-checks its tests alone, so the fixture never sees a fourth noun's merge. It lost because it hides the error and keeps the false claim; `tsconfig.client.json` makes one aggregate client program on purpose.

## Consequences

Adding a reference noun writes the required host merge, the required client merge, a `defineReferenceUi({ id, key, slice, label, mention })` call and `export const apply = <k>.apply`. It writes no `?`, no `?? {}`, no cast and no edit to a shared package; the [reference nouns note](2026-10-17-dv-architecture-reference-nouns.md) owns the kit and the measured cost of a noun. An extra noun field, such as `traits: string[]` on character, is a required type.

The reads that the owners serve do not throw when a host plugin is missing: `timelinesOf`, `plansOf` and the noun reads of the kit return the owner's empty value. The compiler checks absence: a direct read such as `state.components.character.hero` in client code fails with `'state.components.character' is possibly 'undefined'`, so a reader goes through the owner's accessor or proves presence with `Pick`.

The cost is one accessor per non-kit owner and a `FixtureState` type that each test uses when it reads `plan` or `timeline`. Applying the model to the shipped packages changed 17 files with 66 insertions and 52 deletions; the logic change sits in `@dv/ui-kit` only, and most other edits are in tests.

The host has one remaining gap. `api/src/wire.ts`, `api/src/summaries.ts` and `chat-references/src/expand.ts` (under `packages/dv/`) read `state.components.timeline.timelines`, but the `inject` lists of their plugins hold only `dvProject` and `dvAssetPool` (`packages/dv/api/src/index.ts`, `packages/dv/chat-references/src/index.ts`). These reads assume that `@dv/timeline` is loaded without the Cordis guarantee. Under the Cordis rule, the repair adds `dvTimeline` to both `inject` lists.
