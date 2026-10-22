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

### 工具定义

#### 模型看到什么

两个工具 `dv_style_create` 和 `dv_style_update`，格式与 `@dv/project` 给每个操作工具的一样。每个工具接受名为 `style` 的 ID 参数、`name`、`description`（"Words carried into every prompt: wardrobe, mood, or look."），以及带素材 ID 的 `inputs.reference`。创建工具的描述说明风格是可重复使用的视觉风格、镜头以输入 `<style>@1` 指明它，以及 ID 不得已用于其他引用种类的条目；更新工具的描述说明下一个版本保留调用未改的内容，并把用上一版本做出的一切标为过期。`dv_proj_state` 的 `styles` 字段列出每个风格的最新版本，skill `style` 说明这些参数。

#### Token 影响

两个定义约 600 个 token，插件挂载期间固定不变；`@dv/project` 的共享参数让每个定义多约 200 个 token。

#### KV Cache 影响

这些定义位于每次智能体请求中固定的工具部分；挂载或移除插件会改变工具列表，使缓存前缀从工具部分起失效。

### 工具结果

#### 模型看到什么

一次调用返回一个文本块：`done <record>: style Noir created`（更新时为 `style s1 updated`）和参数。被拒绝的 ID 返回说明原因的工具错误，例如 "The ID 's1' already names a character; update it, or choose another ID." 或 "Unknown style 's9'."

#### Token 影响

每次调用约 50 个 token。

#### KV Cache 影响

结果在调用之后追加到对话中；已缓存的前缀保持不变。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不读旧记录** —— 没有归约函数读取旧项目的 `bible.*` 记录，所以这样的项目不显示风格。
