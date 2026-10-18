---
description: "Browser half of the DreamVerse shot plan: the canvas node kind that draws each plan at its latest version with a frame grid of one slot per shot, the takes in use that keep the producers of a plan's reference assets on the canvas, the plan editor with its versions, approval status and shots, and the History row of plan records."
kind: "package-reference"
---

# @dv/ui-shot-plan

English | [中文](README.zh.md)

## Summary

Use this package to show the plans of the `plan` slice (`@dv/shot-plan`) on the canvas. It registers one node kind and one takes-in-use descriptor in `dvCanvas` of `@dv/ui-canvas`. The canvas core draws each plan as one `plan` node, `plan:<PlanId>`, at its latest version with the default card: `分镜计划 · 第 2 版` / `Plan · v2` above a frame grid of one slot per shot and the title `3 个镜头 · 0:12` / `3 shots · 0:12`. The records that produced the reference assets of the latest version stay on the canvas. The editor of a plan node shows the plan editor of this package. It also registers one History row in `dvHistory` of `@dv/ui-history`, which names the plan of a `plan.create` or `plan.update` record.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a profile that stacks `dsh-web-app`, `@dv/api` and `@dv/ui-canvas`. Build the browser bundle first: `pnpm run build` writes `lib/client.js`.

```yaml
- id: dv-ui-shot-plan
  name: '@dv/ui-shot-plan'
```

| Descriptor | Registry | Value |
| --- | --- | --- |
| `planNodeKind` | `dvCanvas.nodeKinds` | `id: '@dv/ui-shot-plan'`, `kind: 'plan'`, label `分镜计划` / `Plan`, color `var(--dv-kind-plan)`, column 1; one seed per plan with a version: ID `plan:<PlanId>`, `record` the record that wrote the latest version, `records` the records that wrote the earlier versions, subtitle `第 N 版` / `vN`, title the shot count followed by ` · <total duration>` when every shot has a duration, no media, `slots` the shot count |
| `PlanEditor` | the `dv.canvas.editor` slot | key `@dv/ui-shot-plan`, owner `{ node, state, host }` (it uses no `host` member); shows the chosen version's `title`, switches between the plan's versions (`第 1 版` / `v1`, …; the latest first) and shows the chosen version's status (`已批准` / `Approved` when a registered chain anchor lists it among the approved versions of the node, `已被第 N 版取代` / `Replaced by vN` when a later version replaced it before approval, else `待批准` / `Awaiting approval`), its shot count, total duration, aspect ratio and reference assets, then one card per shot: duration, model and task label, reference assets of any media type in input order (each image numbered `Picture N` and named by the first `VersionKind` that names its version, else by the asset), whether it continues the previous shot, and the prompt with each `Picture N` or `<Picture N>` token drawn as that image; a shot in task `t2v` has no references |
| `planReferencesInUse` | `dvCanvas.takesInUse` | `id: '@dv/ui-shot-plan'`; `uses` gives the producer (`created_by`) of each asset among the references of each plan's latest version and of its shots; a version reference such as `c1@1` names no record |
| `planHistoryRow` | `dvHistory.rows` | `match: 'plan.'`; the subject of `plan.create` is its title as `《猫》` / ` “猫”`, else its PlanId as ` p1`; the subject of `plan.update` is ` p1 → v2` with the version it wrote, else ` p1`; the PlanId and the version come from the record's `report`, else from its params, and a plan named by its record ID gives no subject; any other `plan.*` record has no subject |

The Host half registers nothing. The browser half registers both descriptors inside `ctx.inject(['dvCanvas'], …)`, the editor entry inside `ctx.inject(['dvCanvas', 'slots'], …)` once a host declares `dv.canvas.editor`, and the History row inside `ctx.inject(['dvHistory'], …)`, so it loads without these services, and each registration leaves with its services or with the plugin. The texts follow the interface language of `<html lang>` (`pickText` and `useText` of `@dv/ui-kit/locale.ts`); the canvas reads the seeds again when the language changes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/index.ts` merges `PlanState` of the client face `@dv/shot-plan/types` into the client `ComponentStates` of `@dv/ui-kit`, so the package reads the `plan` slice typed. The canvas core fills the frame grid from the anchored takes of each slot, centers the seed for a History focus on a record in `records`, and shows the editor entry under its own editor header. The plan editor reads the approved versions from the chain anchors and the names of version references from the version kinds of `dvCanvas`, and the task labels from `GET /api/dv/tasks`.

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The inert Host Loader entry |
| [`src/client/index.ts`](src/client/index.ts) | `planNodeKind`, `planReferencesInUse`, `planHistoryRow`, and the registrations |
| [`src/client/PlanEditor.tsx`](src/client/PlanEditor.tsx) | `PlanEditor`, `shotReferences`, and `totalSec` |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/shot-plan`](../shot-plan/README.md): `plan.create`, `plan.update` and the `plan` slice.
- [`@dv/ui-canvas`](../ui-canvas/README.md): how the canvas draws a seed with the default card and fills its frame grid.
- [`@dv/ui-history`](../ui-history/README.md): how a History row gets its subject.
- [`@dv/ui-kit`](../ui-kit/README.md): the `NodeKind`, `NodeSeed`, `TakesInUse` and `HistoryRow` descriptor types.

-----

<a id="model-experience"></a>
## Model Experience

None; the package sends nothing to a model.

#### KV Cache effect

None; the package sends nothing to a model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Editor only in the center canvas** — only the `dv.center.view` entry of `@dv/ui-canvas` declares `dv.canvas.editor`. The canvas tab body of the right Sidebar renders no entry, so its plan editor shows only its header.
- **Plan title only in the editor body** — the seed title is the shot count and total duration, so a plan's own `title` appears in the plan editor's version row, but on no card and in no editor header.
