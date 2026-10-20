---
description: "The style component of DreamVerse: reusable visual looks, with their reference images, as versions that shots name as <id>@<version>."
kind: "package-reference"
---

# @dv/style

English | [中文](README.zh.md)

## Summary

Use this package to keep reusable visual looks in a DreamVerse project. The `dvStyle` service is one `defineReference` declaration of `@dv/reference-kit`. It registers with `dvProject` the component key `style`, its reducer, the reference kind `style`, the operations `style.create` and `style.update` (the agent tools `dv_style_create` and `dv_style_update`), and, while the DSH skill registry is mounted, the skill `style`. Each create or update writes the next version of an ID; a shot names a version as the input `<id>@<version>`, such as `s1@1`, which stands for that version's reference images.

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
- id: dv-style
  name: '@dv/style'
```

| Operation | Label | Params | Inputs |
| --- | --- | --- | --- |
| `style.create` | 新建风格 / Create style | `style` (required ID, without `@` or `#`), `name` (required), `description` | `reference`: images, many |
| `style.update` | 修改风格 / Update style | `style` (required ID), `name`, `description` | `reference`: images, many; none keeps the current ones |

`style.create` refuses an ID that any reference kind already has. `style.update` supersedes the record that wrote the current version, so every record that read that version becomes stale. The `style` field of `dv_proj_state` is `styles`: the newest version of each ID.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The `defineReference` declaration of the `dvStyle` service |
| [`src/types.ts`](src/types.ts) | The client face `@dv/style/types`: `StyleId`, `Style`, `StyleState`, and their merges into `@dv/project/types` |
| [`skills/style/SKILL.md`](skills/style/SKILL.md) | The skill `style` |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/reference-kit`](../reference-kit/README.md): what `defineReference` registers.
- [`@dv/ui-style`](../ui-style/README.md): the browser half of the style component.

-----

<a id="model-experience"></a>
## Model Experience

The model sees the tools `dv_style_create` and `dv_style_update` with the texts of `@dv/reference-kit`, the `styles` field of `dv_proj_state`, and the skill `style`.

#### KV Cache effect

The tool definitions and the skill text are fixed for a mounted plugin, so they keep the prompt prefix stable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No old records** — no reducer reads a `bible.*` record of an older project, so such a project shows no styles.
