---
description: "DreamVerse 的风格组件：可复用的视觉风格及其参考图，以版本保存，镜头用 <id>@<version> 引用。"
kind: "package-reference"
---

# @dv/style

[English](README.md) | 中文

## 概述

使用本包在 DreamVerse 项目中保存可复用的视觉风格。`dvStyle` 服务是 `@dv/reference-kit` 的一个 `defineReference` 声明。它向 `dvProject` 注册组件键 `style`、它的归约函数、引用种类 `style`、操作 `style.create` 和 `style.update`（智能体工具 `dv_style_create` 和 `dv_style_update`），并在 DSH skill 注册表挂载时注册 skill `style`。每次创建或更新写下一个 ID 的下一个版本；镜头用输入 `<id>@<version>`（如 `s1@1`）引用一个版本，它代表该版本的参考图。

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
- id: dv-style
  name: '@dv/style'
```

| 操作 | 名称 | 参数 | 输入 |
| --- | --- | --- | --- |
| `style.create` | 新建风格 / Create style | `style`（必填 ID，不含 `@` 或 `#`）、`name`（必填）、`description` | `reference`：图片，多个 |
| `style.update` | 修改风格 / Update style | `style`（必填 ID）、`name`、`description` | `reference`：图片，多个；不给时保留当前参考图 |

`style.create` 拒绝任何引用种类已有的 ID。`style.update` 取代写下当前版本的记录，所以读过该版本的每条记录都会过期。`dv_proj_state` 中 `style` 的字段是 `styles`：每个 ID 的最新版本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | `dvStyle` 服务的 `defineReference` 声明 |
| [`src/types.ts`](src/types.ts) | 客户端类型入口 `@dv/style/types`：`StyleId`、`Style`、`StyleState`，以及它们并入 `@dv/project/types` 的声明 |
| [`skills/style/SKILL.md`](skills/style/SKILL.md) | skill `style` |

-----

<a id="further-exploration"></a>
## 延伸阅读

- [`@dv/reference-kit`](../reference-kit/README.zh.md)：`defineReference` 注册的内容。
- [`@dv/ui-style`](../ui-style/README.zh.md)：风格组件的浏览器半边。

-----

<a id="model-experience"></a>
## 模型体验

模型看到带 `@dv/reference-kit` 文案的工具 `dv_style_create` 和 `dv_style_update`、`dv_proj_state` 的 `styles` 字段，以及 skill `style`。

#### KV Cache 影响

插件挂载期间工具定义和 skill 文本不变，所以提示词前缀保持稳定。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不读旧记录** —— 没有归约函数读取旧项目的 `bible.*` 记录，所以这样的项目不显示风格。
