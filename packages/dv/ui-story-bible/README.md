---
description: "Browser half of the DreamVerse story bible: the canvas node kind that draws each character, location and style at its newest version, the version kinds of the reference kinds character, location and style, and the records whose outputs the newest versions use as references."
kind: "package-reference"
---

# @dv/ui-story-bible

English | [中文](README.zh.md)

## Summary

Use this package to show the story bible (`@dv/story-bible`) on the canvas of `@dv/ui-canvas`. It registers into `dvCanvas` one node kind, which draws each character, location and style at its newest version as a node `bible:<id>`, one version kind for each of the reference kinds `character`, `location` and `style`, and one `TakesInUse`, which keeps the takes that the newest versions use as references on the canvas. The canvas reads versioned items only through the registered version kinds: the edge from an item to a take that reads one of its versions, the reference chips of the take editor, the items that the asset picker offers, and the reference lists of the plan editor.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a profile that stacks `dsh-web-app`, `@dv/api`, `@dv/story-bible` and `@dv/ui-canvas`. Build the browser bundle first: `pnpm run build` writes `lib/client.js`.

```yaml
- id: dv-ui-story-bible
  name: '@dv/ui-story-bible'
```

| Descriptor | Registry | Value |
| --- | --- | --- |
| `bibleNodeKind` | `dvCanvas.nodeKinds` | `id: '@dv/ui-story-bible'`, `kind: 'bible'`, column 0, the character color; one seed per item with a version, characters first, then locations, then styles: ID `bible:<id>`, the label 角色 / Character, 场景 / Location or 风格 / Style in the interface language, the newest version's name (else the item ID) as title and its references as media, the record that wrote it, and the records of the earlier versions |
| `bibleVersionKinds` | `dvCanvas.versionKinds` | one entry per kind `character`, `location`, `style`: `node(id)` is `bible:<id>`; `latest` lists every item at its newest version; `name` and `assets` give the name and the references of one version, or null and `[]` for an unknown version |
| `bibleReferencesInUse` | `dvCanvas.takesInUse` | `id: '@dv/ui-story-bible'`; `uses` gives the record that created each reference of each newest version |

The Host half registers nothing. The browser half registers the five descriptors inside `ctx.inject(['dvCanvas'], …)`, so it loads without the service, and each descriptor leaves with the service or with the plugin.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Every descriptor reads the `bible` slice and the `proj` records of the wire state, typed by the client copy `StoryBibleState` of `@dv/ui-kit/types.ts`. The default card of `@dv/ui-canvas` draws each seed: the kind dot, the seed's label, the first image or video reference at 40 × 40 with "+N" for more, and the title. A seed has no subtitle, so the card shows no description.

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The inert Host Loader entry |
| [`src/client/index.ts`](src/client/index.ts) | `bibleNodeKind`, `bibleVersionKinds`, `bibleReferencesInUse`, and their registrations |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/story-bible`](../story-bible/README.md): the `bible` slice and the reference kinds `character`, `location` and `style`.
- [`@dv/ui-canvas`](../ui-canvas/README.md): how the canvas draws seeds and reads versioned items through the version kinds.
- [`@dv/ui-kit`](../ui-kit/README.md): the `NodeKind`, `NodeSeed`, `VersionKind` and `TakesInUse` descriptor types.

-----

<a id="model-experience"></a>
## Model Experience

None; the package sends nothing to a model.

#### KV Cache effect

None; the package sends nothing to a model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Editor in the canvas** — `@dv/ui-canvas` draws the editor of a `bible` node: it reads the item through the version kinds, edits its references with `bible.<kind>_update`, and shows no description, because neither a seed nor a version kind carries one.
- **Copied slice type** — the package reads the `bible` slice through the client copy `StoryBibleState` of `@dv/ui-kit/types.ts`, not through a client type of `@dv/story-bible`.
