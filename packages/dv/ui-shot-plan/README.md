---
description: "Browser half of the DreamVerse shot plan: the canvas node kind that draws each plan at its latest version with a frame grid of one slot per shot, and the takes in use that keep the producers of a plan's reference assets on the canvas."
kind: "package-reference"
---

# @dv/ui-shot-plan

English | [中文](README.zh.md)

## Summary

Use this package to show the plans of the `plan` slice (`@dv/shot-plan`) on the canvas. It registers one node kind and one takes-in-use descriptor in `dvCanvas` of `@dv/ui-canvas`. The canvas core draws each plan as one `plan` node, `plan:<PlanId>`, at its latest version with the default card: `分镜计划 · 第 2 版` / `Plan · v2` above a frame grid of one slot per shot and the title `3 个镜头 · 0:12` / `3 shots · 0:12`. The records that produced the reference assets of the latest version stay on the canvas.

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
| `planReferencesInUse` | `dvCanvas.takesInUse` | `id: '@dv/ui-shot-plan'`; `uses` gives the producer (`created_by`) of each asset among the references of each plan's latest version and of its shots; a version reference such as `c1@1` names no record |

The Host half registers nothing. The browser half registers both descriptors inside `ctx.inject(['dvCanvas'], …)`, so it loads without `dvCanvas`, and each descriptor leaves with the service or with the plugin. The texts follow the interface language of `<html lang>` (`pickText` of `@dv/ui-kit/locale.ts`); the canvas reads the seeds again when the language changes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The client state type of `@dv/ui-kit` declares the `plan` slice (`PlanState`), so the package reads it typed. The canvas core fills the frame grid from the anchored takes of each slot, centers the seed for a History focus on a record in `records`, and opens its own plan editor for a seed whose kind is `plan`.

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The inert Host Loader entry |
| [`src/client/index.ts`](src/client/index.ts) | `planNodeKind`, `planReferencesInUse`, and their registrations |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/shot-plan`](../shot-plan/README.md): `plan.create`, `plan.update` and the `plan` slice.
- [`@dv/ui-canvas`](../ui-canvas/README.md): how the canvas draws a seed with the default card and fills its frame grid.
- [`@dv/ui-kit`](../ui-kit/README.md): the `NodeKind`, `NodeSeed` and `TakesInUse` descriptor types.

-----

<a id="model-experience"></a>
## Model Experience

None; the package sends nothing to a model.

#### KV Cache effect

None; the package sends nothing to a model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Plan editor in the canvas core** — `@dv/ui-canvas` still draws the editor of a `plan` seed (versions, approval status, shots); the package registers no `dv.canvas.editor` entry.
- **Plan title not shown** — the seed title is the shot count and total duration, so a plan's own `title` appears on no card and in no editor header.
