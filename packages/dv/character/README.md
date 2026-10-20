---
description: "The character component of DreamVerse: people who must look the same across shots, with their reference images, as versions that shots name as <id>@<version>."
kind: "package-reference"
---

# @dv/character

English | [中文](README.zh.md)

## Summary

Use this package to keep people who must look the same across shots in a DreamVerse project. The `dvCharacter` service is one `defineReference` declaration of `@dv/reference-kit`. It registers with `dvProject` the component key `character`, its reducer, the reference kind `character`, the operations `character.create` and `character.update` (the agent tools `dv_character_create` and `dv_character_update`), and, while the DSH skill registry is mounted, the skill `character`. Each create or update writes the next version of an ID; a shot names a version as the input `<id>@<version>`, such as `c1@1`, which stands for that version's reference images.

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
- id: dv-character
  name: '@dv/character'
```

| Operation | Label | Params | Inputs |
| --- | --- | --- | --- |
| `character.create` | 新建角色 / Create character | `character` (required ID, without `@` or `#`), `name` (required), `description` | `reference`: images, many |
| `character.update` | 修改角色 / Update character | `character` (required ID), `name`, `description` | `reference`: images, many; none keeps the current ones |

`character.create` refuses an ID that any reference kind already has. `character.update` supersedes the record that wrote the current version, so every record that read that version becomes stale. The `character` field of `dv_proj_state` is `characters`: the newest version of each ID.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

| File | Content |
| --- | --- |
| [`src/index.ts`](src/index.ts) | The `defineReference` declaration of the `dvCharacter` service |
| [`src/types.ts`](src/types.ts) | The client face `@dv/character/types`: `CharacterId`, `Character`, `CharacterState`, and their merges into `@dv/project/types` |
| [`skills/character/SKILL.md`](skills/character/SKILL.md) | The skill `character` |

-----

<a id="further-exploration"></a>
## Further Exploration

- [`@dv/reference-kit`](../reference-kit/README.md): what `defineReference` registers.
- [`@dv/ui-character`](../ui-character/README.md): the browser half of the character component.

-----

<a id="model-experience"></a>
## Model Experience

The model sees the tools `dv_character_create` and `dv_character_update` with the texts of `@dv/reference-kit`, the `characters` field of `dv_proj_state`, and the skill `character`.

#### KV Cache effect

The tool definitions and the skill text are fixed for a mounted plugin, so they keep the prompt prefix stable.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No old records** — no reducer reads a `bible.*` record of an older project, so such a project shows no characters.
