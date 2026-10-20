---
description: "The location component of DreamVerse: places shots happen in, with their reference images, as versions that shots name as <id>@<version>."
kind: "package-reference"
---

# @dv/location

English | [中文](README.zh.md)

## Summary

Use this package to keep places shots happen in in a DreamVerse project. The `dvLocation` service is one `defineReference` declaration of `@dv/reference-kit`. It registers with `dvProject` the component key `location`, its reducer, the reference kind `location`, the operations `location.create` and `location.update` (the agent tools `dv_location_create` and `dv_location_update`), and, while the DSH skill registry is mounted, the skill `location`. Each create or update writes the next version of an ID; a shot names a version as the input `<id>@<version>`, such as `l1@1`, which stands for that version's reference images.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after `@dv/project`:

```yaml
- id: dv-location
  name: '@dv/location'
```

| Operation | Label | Params | Inputs |
| --- | --- | --- | --- |
| `location.create` | 新建场景 / Create location | `location` (required ID, without `@` or `#`), `name` (required), `description` | `reference`: images, many |
| `location.update` | 修改场景 / Update location | `location` (required ID), `name`, `description` | `reference`: images, many; none keeps the current ones |

`location.create` refuses an ID that any reference kind already has. `location.update` supersedes the record that wrote the current version, so every record that read that version becomes stale. The `location` field of `dv_proj_state` is `locations`: the newest version of each ID.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The `defineReference` declaration of the `dvLocation` service |
| [`src/types.ts`](src/types.ts) | The client face `@dv/location/types`: `LocationId`, `Location`, `LocationState`, and their merges into `@dv/project/types` |
| [`skills/location/SKILL.md`](skills/location/SKILL.md) | The skill `location` |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/reference-kit`](../reference-kit/README.md): what `defineReference` registers.
- [`@dv/ui-location`](../ui-location/README.md): the browser half of the location component.

-----

<a id="model-experience"></a>
## Model Experience

The model sees the tools `dv_location_create` and `dv_location_update` with the texts of `@dv/reference-kit`, the `locations` field of `dv_proj_state`, and the skill `location`.

#### KV Cache effect

The tool definitions and the skill text are fixed for a mounted plugin, so they keep the prompt prefix stable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No old records** — no reducer reads a `bible.*` record of an older project, so such a project shows no locations.
