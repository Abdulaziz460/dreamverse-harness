---
description: "Browser half of the DreamVerse story bible: the canvas node kind that draws each character, location and style at its newest version, the version kinds of the reference kinds character, location and style, the records whose outputs the newest versions use as references, the editor body of a story bible node, the mention kinds of the composer's @ menu, and the History row of story bible records."
kind: "package-reference"
---

# @dv/ui-story-bible

English | [中文](README.zh.md)

## Summary

Use this package to show the story bible (`@dv/story-bible`) on the canvas of `@dv/ui-canvas`. It registers into `dvCanvas` one node kind, which draws each character, location and style at its newest version as a node `bible:<id>`, one version kind for each of the reference kinds `character`, `location` and `style`, and one `TakesInUse`, which keeps the takes that the newest versions use as references on the canvas. It registers the editor body of a story bible node as its `dv.canvas.editor` entry, one mention kind per reference kind into `dvMentions` of `@dv/ui-composer`, so the composer's `@` menu lists each item, and one History row into `dvHistory` of `@dv/ui-history`, which names the item of a story bible record. The canvas reads versioned items only through the registered version kinds: the edge from an item to a take that reads one of its versions, the reference chips of the take editor, the items that the asset picker offers, and the reference lists of the plan editor.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a profile that stacks `dsh-web-app`, `@dv/api`, `@dv/story-bible`, `@dv/ui-canvas` and `@dv/ui-composer`. Build the browser bundle first: `pnpm run build` writes `lib/client.js`.

```yaml
- id: dv-ui-story-bible
  name: '@dv/ui-story-bible'
```

| Descriptor | Registry | Value |
| --- | --- | --- |
| `bibleNodeKind` | `dvCanvas.nodeKinds` | `id: '@dv/ui-story-bible'`, `kind: 'bible'`, column 0, the character color; one seed per item with a version, characters first, then locations, then styles: ID `bible:<id>`, the label 角色 / Character, 场景 / Location or 风格 / Style in the interface language, the newest version's name (else the item ID) as title and its references as media, the record that wrote it, and the records of the earlier versions |
| `bibleVersionKinds` | `dvCanvas.versionKinds` | one entry per kind `character`, `location`, `style`: `label()` is the kind's card label (`角色` / `Character`, `场景` / `Location`, `风格` / `Style`), which titles the kind's section in the asset picker; `node(id)` is `bible:<id>`; `latest` lists every item at its newest version; `name` and `assets` give the name and the references of one version, or null and `[]` for an unknown version |
| `bibleReferencesInUse` | `dvCanvas.takesInUse` | `id: '@dv/ui-story-bible'`; `uses` gives the record that created each reference of each newest version |
| `BibleEditor` | slot `dv.canvas.editor`, key `@dv/ui-story-bible` | the editor body of the item that the seed draws: each reference of the newest version (an image, or the first frame of a video), which opens the canvas's preview (`host.preview`) and can be removed while more than one is left, because `bible.<kind>_update` without references keeps the current ones; the version's description; and "Add asset", which opens the canvas's picker of assets only (`host.pickAssets`) and appends the picked assets. Each change runs `bible.<kind>_update` with every reference of the next version as input role `reference` through `host.run` |
| `bibleMentionKinds` | `dvMentions.kinds` | one entry per kind, in order 1 `character` (section 角色 / Characters), 2 `location` and 3 `style` (one section 场景和风格 / Locations and styles); `id` is `@dv/ui-story-bible:<kind>`; one item per item with a version: the address `dv:<kind>/<id>`, the newest version's name (else the item ID) as label, the first 40 characters of its description, and its first reference as `thumb` |
| `bibleHistoryRow` | `dvHistory.rows` | `match: 'bible.'`; the subject is the record's `name` param as `「阿明」` / ` “阿明”`, else the item ID of its `character`, `location` or `style` param in the same form, else none |

The Host half registers nothing. The browser half registers the five canvas descriptors inside `ctx.inject(['dvCanvas'], …)`, the editor entry inside `ctx.inject(['slots'], …)`, the three mention kinds inside `ctx.inject(['dvMentions'], …)`, and the History row inside `ctx.inject(['dvHistory'], …)`, so it loads without any of these services, and each registration leaves with its service or with the plugin.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Every canvas and mention descriptor reads the `bible` slice and the `proj` records of the wire state, typed by `StoryBibleState` of the client face `@dv/story-bible/types`, which `src/client/index.ts` merges into the client `ComponentStates` of `@dv/ui-kit`; the History row reads only the params of its record. The default card of `@dv/ui-canvas` draws each seed: the kind dot, the seed's label, the first image or video reference at 40 × 40 with "+N" for more, and the title. A seed has no subtitle, so the card shows no description.

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The inert Host Loader entry |
| [`src/client/index.ts`](src/client/index.ts) | `bibleNodeKind`, `bibleVersionKinds`, `bibleReferencesInUse`, `bibleMentionKinds`, `bibleHistoryRow`, and the registrations |
| [`src/client/kinds.ts`](src/client/kinds.ts) | The reference kinds with their slice fields and labels, `itemsOf` (the versions of one kind by plain string ID), and the node ID `bible:<id>` |
| [`src/client/BibleEditor.tsx`](src/client/BibleEditor.tsx) | `BibleEditor`, the `dv.canvas.editor` entry |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/story-bible`](../story-bible/README.md): the `bible` slice and the reference kinds `character`, `location` and `style`.
- [`@dv/ui-canvas`](../ui-canvas/README.md): how the canvas draws seeds and reads versioned items through the version kinds.
- [`@dv/ui-history`](../ui-history/README.md): how a History row gets its subject.
- [`@dv/ui-kit`](../ui-kit/README.md): the `NodeKind`, `NodeSeed`, `VersionKind`, `TakesInUse` and `HistoryRow` descriptor types.

-----

<a id="model-experience"></a>
## Model Experience

None; the package sends nothing to a model.

#### KV Cache effect

None; the package sends nothing to a model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Editor only in the center canvas** — only the `dv.center.view` entry of `@dv/ui-canvas` declares `dv.canvas.editor`. The canvas tab body of the right Sidebar renders no entry, so its story bible editor shows only its header.
