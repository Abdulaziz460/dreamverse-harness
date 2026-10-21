# Agent Note: DreamVerse UI registries — UI core draws what UI plugins register

Status: implemented

English | [中文](2026-10-17-dv-architecture-ui-registries.zh.md)

## Problem

The shared browser packages named the plugin nouns, so a plugin's interface could not be added or removed alone. `@dv/ui-canvas` drew story-bible nodes through `BibleKind` and `bibleItems` (`ui-canvas/src/client/graph.ts`), held the plan editor (`PlanHeader`, `PlanShots`), and deep-imported `AssetsPanel` and `Preview` from `@dv/ui-asset-pool`. `@dv/ui-history` folded renders under an approval through `scheduledBy`, which read the report of `plan.approve`, and named records in a `switch` with `plan.*` arms. `@dv/ui-composer` built the `@` menu by reading `state.components.timeline` and `state.components.bible`. `@dv/ui-shell` deep-imported the canvas and timeline views (`ui-shell/src/client/views.ts`). `@dv/ui-kit` fixed `RENDER_OPERATION = 'shot.render'` as the one operation whose records are takes. Adding one reference noun touched `ui-canvas`, `ui-history`, `ui-composer` and `ui-kit`, and an image or audio operation drew no take until the kit learned its name.

## Decision

The browser half of DreamVerse splits into UI core and UI plugins; [layers](2026-10-17-dv-architecture-layers.md) lists the packages and allowed imports of each layer. UI core is `@dv/ui-kit`, `@dv/ui-canvas`, `@dv/ui-history`, `@dv/ui-shell` and `@dv/ui-composer`; it draws only what plugins register and names no plugin noun ([R5](../process/2026-10-17-dv-architecture-fitness-test.md)). A UI plugin is a package `packages/dv/ui-<name>` with a `./client` entry, paired with the host package `<name>` when that package exists.

`@dv/ui-kit` is a library: it registers nothing, and each consumer bundles the modules it imports. It holds the wire types (`src/client/types.ts`), the registry descriptor types and `createRegistry` (`src/client/registries.ts`), and the pure helpers that every view applies in one way: `chainOf`, `versionRefOf`, `formatInputRef`, `isGenerationOperation`, `isGenerationRecord`, `operationLabel` and `taskLabel`. How a UI half types its own slice is in [client state types](2026-10-17-dv-architecture-client-state-types.md).

Each registry is a Cordis service that the UI-core package which reads it provides with `ctx.reflect.provide` at the top level of its `apply`, never inside an effect, because other plugins register into it from their own fibers: `@dv/ui-canvas` provides `dvCanvas`, `@dv/ui-history` provides `dvHistory`, and `@dv/ui-composer` provides `dvMentions`. `createRegistry(keys)` returns a descriptor list with one owner per key: `register` throws when another descriptor holds one of the keys and otherwise returns a disposer, `list()` returns the same array until a change, and `subscribe` reports each change.

A UI half registers each descriptor as a `scope.effect` inside `ctx.inject(['dvCanvas'], …)` (or `dvHistory`, `dvMentions`, `slots`), so the plugin loads without the service, and its descriptors leave when the service or the plugin leaves. Each registering package tests that disposal removes its descriptors, as `packages/AGENTS.md` requires. A UI half changes project data only by running an operation ([data flow](2026-10-17-dv-architecture-data-flow.md)).

## Registries and slots

The descriptor types and the `SlotMap` merges all live in `packages/dv/ui-kit/src/client/registries.ts`. The three reference nouns register through one `defineReferenceUi` call each ([reference nouns](2026-10-17-dv-architecture-reference-nouns.md)); the table writes `ui-character`, `ui-location` and `ui-style` as "the nouns".

| Registry or slot                        | Provided or declared by                   | Key           | A descriptor or entry gives                                                            | Registrants                                                   |
| --------------------------------------- | ----------------------------------------- | ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `dvCanvas.nodeTypes`                    | `ui-canvas`                               | `id`          | one type of canvas node and its entries, read from the plugin's own slice              | `ui-shot-plan` (`plan`), the nouns                            |
| `dvCanvas.chainAnchors`                 | `ui-canvas`                               | `starter`     | the node that the records of one starter operation hang off, and its approved versions | `ui-workflow-story` (`story.approve`)                         |
| `dvCanvas.takesInUse`                   | `ui-canvas`                               | `id`          | the records whose outputs a plugin's data uses, and badges on asset nodes              | `ui-timeline`, `ui-shot-plan`, the nouns                      |
| `dvCanvas.versionKinds`                 | `ui-canvas`                               | `kind`        | the versions, names, reference assets and node ID of one reference kind                | the nouns                                                     |
| `dvHistory.rows`                        | `ui-history`                              | `match`       | the subject and the center focus of the history rows of one operation or component key | `ui-workflow-story`, `ui-timeline`, `ui-shot-plan`, the nouns |
| `dvMentions.kinds`                      | `ui-composer`                             | `id`          | one section of the `@` menu                                                            | `ui-timeline` (`clip`), the nouns                             |
| `dv.canvas.editor` (keyed slot)         | the `dv.center.view` entry of ui-canvas   | `NodeType.id` | the editor body of a node entry                                                        | `ui-shot-plan`, the nouns                                     |
| `dv.canvas.picker`, `dv.canvas.preview` | the `dv.center.view` entry of ui-canvas   | `assets`      | the asset pool panel of the asset picker, and the preview of one asset                 | `ui-asset-pool`                                               |
| `dv.center.view` (list slot)            | the `main.conversation` entry of ui-shell | entry `id`    | one view of the open project in the workspace center                                   | `ui-canvas` (`canvas`), `ui-timeline` (`timeline`)            |

An editor entry imports only `@dv/ui-kit`, so the canvas lends it an `EntryEditorHost`: `run` runs an operation as a canvas write with the canvas's project and chat session, `pickAssets` opens the canvas's asset picker, and `preview` opens the canvas's asset preview. One entry declares a slot: the center view of ui-canvas declares the three canvas slots, and the right-Sidebar tab body of the canvas (`CanvasBody.tsx`) declares none.

## Canvas, history and mention rules

**Takes.** A record is a take when `isGenerationRecord(record, op, mimeOf)` holds. When `/api/dv/operations` lists the record's operation, the declaration decides (not deterministic, resource `gpu`, an image, video or audio output), so a pending take draws before it has outputs; otherwise the record's own facts decide.

**Chains and anchors.** The chain of a record is `chainOf`: its own `started_by`, else the `started_by` of its `based_on` root, so a retake keeps its shot. A chain is anchored when its starter record is loaded and a `ChainAnchor` is registered for the starter's operation. An anchored chain titles a take by slot and lane, hangs it off the anchor node by a `chain` edge, groups and numbers takes, and fills the frame grid of an entry that has `slots`; any other take is a free take, titled with its operation label. The approved versions of a node are the union of `approvedVersions` over every anchor; the [workflows](2026-10-17-dv-architecture-workflows.md) note owns the chain that `story.approve` writes.

**Entry cards.** The core draws every `NodeEntry` with one card: the type dot in `NodeType.color`, `NodeType.label()`, then ` · <subtitle>`. An entry with `slots` shows the frame grid; any other entry shows its first media and `+N` for more.

**History.** The loaded records whose `started_by.record` is a row's record fold under that row. A row reads `operationLabel` plus the subject of the registered `HistoryRow` that matches the operation, an exact name first, then `'<key>.'`; a matching row never falls through to another row. A record without a matching row names its chain slot and lane, as in 渲染镜头 1 · 9:16. Selecting a row runs the row's `focus`; without one, a `proj` record focuses nothing and any other record centers its canvas node.

**Mentions.** The `@` source of ui-composer lists the items of every `MentionKind` by `order` under its `section()`, then the newest 40 images and videos. A pick inserts `@[<label>](dv:<kind>/<id>)`, which `@dv/chat-references` expands for every kind in `dvProject.listReferenceKinds()`.

## The names NodeType and NodeEntry

"Type" names a canvas node type and "kind" names a reference kind of the kernel or a mention kind. `NodeType.type` is the `data-node-type` value of a card, such as `plan` or `character`; `VersionKind.kind` is a reference kind; `MentionKind.kind` is the `<kind>` of `dv:<kind>/<id>`. A `NodeEntry` is one node that a `NodeType` draws, with no label of its own: the card shows `NodeType.label()`. The word "entry" also keeps the drawn node apart from the generation parameter `seed`. Inside ui-canvas, a drawn node is `CanvasNodeType = 'asset' | 'take' | 'entry'`.

## Alternatives considered

**One `DvUi` service in `@dv/ui-kit` holding every registry.** It lost because ui-kit has no client plugin entry, while a DSH client registry is a service that a plugin provides at `apply` top level. Keeping the slot types in ui-shell or ui-canvas lost too, because it would make one UI-core package import another.

**A module-level registry object in ui-kit.** It lost because every bundle that imports ui-kit gets its own copy, so the canvas copy that the shell draws would not reach the registries that plugins fill.

**A plugin's UI half as a `./client` entry of its host package.** It lost to a separate `ui-<name>` package, because a package with both a host face and a client face needs three tsconfig files.

**Grouping takes only by `started_by.record`, without chain anchors.** It hung every take off one plan node even when two approvals started them, and it hid the shot-4 take of a second approval once a fourth plan version reused the takes of the first. Only a workflow knows which starters belong to one plan node, so the workflow registers the anchor.

**Takes in use as an optional method of the node type.** The timeline reports takes in use but draws no node, and every field of a node type is required, so `takesInUse` is its own registry.

**A per-plugin card slot (`dv.canvas.node`) and node claims.** No plugin registered a card or a claim, so the slot was an extension point that nothing used and no test covered.

**Telling takes apart by record outputs, or by a kernel `resource` field on records.** An output test hides a pending take until it finishes. A kernel field helps only records written after it, and no stored record held one (0 of 2178), so the operation declaration decides and record facts are the fallback.

**An editor slot owner of only `{ node, state }`.** An entry that imports only ui-kit would then drop 添加素材 and the asset preview, or copy the picker and the preview; `EntryEditorHost` lends callbacks and no React nodes.

**Renaming `VersionKind` and `MentionKind` to `…Type`.** `VersionType.kind` would mix the two words, and keeping the names left about 130 changed lines out of the rename.

**A `data-node-owner` attribute on each card.** The owners listing of the [fitness test](../process/2026-10-17-dv-architecture-fitness-test.md) maps a `data-node-type` value to its package, and the attribute adds a DOM field and test lines that no user goal asks for.

## Consequences

A plugin's interface is added or removed with its own package. A hand-written UI half that registers a node type, a version kind, takes in use, a history row and a mention kind for a `prop` noun measured 179 counted lines and edited no UI-core file; an ad workflow's UI half that hangs a second chain off the same plan node measured 79 counted lines and edited no file outside its own package. The [reference nouns](2026-10-17-dv-architecture-reference-nouns.md) note gives the smaller cost of a noun built on `defineReferenceUi`.

The registries cost indirection and runtime failure modes:

- A key clash is a runtime error: `register` throws when two plugins claim one node type `id`, starter operation, reference kind or history `match`, and no type check catches it.
- The canvas reads plugin data only through descriptors, so a plan shows as approved only through a registered `ChainAnchor` with `approvedVersions`.
- The canvas tab body in the right Sidebar renders no slot: there an entry editor shows only its header, the asset picker lists only the version items, and an asset chip opens no preview.
- `@dv/ui-kit/src/client/types.ts` copies the host wire types by hand, so a field added on the host is added to the kit by hand.
- The three noun node types share the color `var(--dv-kind-character)`, because the ui-shell theme (`ui-shell/src/client/theme.ts`) defines no location or style token.
- The locale key `node.takeKind` in `ui-canvas/src/client/locales.ts` keeps the word "kind" for the label of a take card.
