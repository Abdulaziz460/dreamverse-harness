---
description: "DreamVerse 的角色组件：在各镜头间必须保持一致的人物及其参考图，以版本保存，镜头用 <id>@<version> 引用。"
kind: "package-reference"
---

# @dv/character

[English](README.md) | 中文

## 概述

使用本包在 DreamVerse 项目中保存在各镜头间必须保持一致的人物。`dvCharacter` 服务是 `@dv/reference-kit` 的一个 `defineReference` 声明。它向 `dvProject` 注册组件键 `character`、它的归约函数、引用种类 `character`、操作 `character.create` 和 `character.update`（智能体工具 `dv_character_create` 和 `dv_character_update`），并在 DSH skill 注册表挂载时注册 skill `character`。每次创建或更新写下一个 ID 的下一个版本；镜头用输入 `<id>@<version>`（如 `c1@1`）引用一个版本，它代表该版本的参考图。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 `@dv/project` 之后挂载插件：

```yaml
- id: dv-character
  name: '@dv/character'
```

| 操作 | 名称 | 参数 | 输入 |
| --- | --- | --- | --- |
| `character.create` | 新建角色 / Create character | `character`（必填 ID，不含 `@` 或 `#`）、`name`（必填）、`description` | `reference`：图片，多个 |
| `character.update` | 修改角色 / Update character | `character`（必填 ID）、`name`、`description` | `reference`：图片，多个；不给时保留当前参考图 |

`character.create` 拒绝任何引用种类已有的 ID。`character.update` 取代写下当前版本的记录，所以读过该版本的每条记录都会过期。`dv_proj_state` 中 `character` 的字段是 `characters`：每个 ID 的最新版本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | `dvCharacter` 服务的 `defineReference` 声明 |
| [`src/types.ts`](src/types.ts) | 客户端类型入口 `@dv/character/types`：`CharacterId`、`Character`、`CharacterState`，以及它们并入 `@dv/project/types` 的声明 |
| [`skills/character/SKILL.md`](skills/character/SKILL.md) | skill `character` |

-----

<a id="further-exploration"></a>
## 延伸阅读

- [`@dv/reference-kit`](../reference-kit/README.zh.md)：`defineReference` 注册的内容。
- [`@dv/ui-character`](../ui-character/README.zh.md)：角色组件的浏览器半边。

-----

<a id="model-experience"></a>
## 模型体验

模型看到带 `@dv/reference-kit` 文案的工具 `dv_character_create` 和 `dv_character_update`、`dv_proj_state` 的 `characters` 字段，以及 skill `character`。

#### KV Cache 影响

插件挂载期间工具定义和 skill 文本不变，所以提示词前缀保持稳定。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不读旧记录** —— 没有归约函数读取旧项目的 `bible.*` 记录，所以这样的项目不显示角色。
