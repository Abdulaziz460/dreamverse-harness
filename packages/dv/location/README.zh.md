---
description: "DreamVerse 的场景组件：镜头发生的地点及其参考图，以版本保存，镜头用 <id>@<version> 引用。"
kind: "package-reference"
---

# @dv/location

[English](README.md) | 中文

## 概述

使用本包在 DreamVerse 项目中保存镜头发生的地点。`dvLocation` 服务是 `@dv/reference-kit` 的一个 `defineReference` 声明。它向 `dvProject` 注册组件键 `location`、它的归约函数、引用种类 `location`、操作 `location.create` 和 `location.update`（智能体工具 `dv_location_create` 和 `dv_location_update`），并在 DSH skill 注册表挂载时注册 skill `location`。每次创建或更新写下一个 ID 的下一个版本；镜头用输入 `<id>@<version>`（如 `l1@1`）引用一个版本，它代表该版本的参考图。

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
- id: dv-location
  name: '@dv/location'
```

| 操作 | 名称 | 参数 | 输入 |
| --- | --- | --- | --- |
| `location.create` | 新建场景 / Create location | `location`（必填 ID，不含 `@` 或 `#`）、`name`（必填）、`description` | `reference`：图片，多个 |
| `location.update` | 修改场景 / Update location | `location`（必填 ID）、`name`、`description` | `reference`：图片，多个；不给时保留当前参考图 |

`location.create` 拒绝任何引用种类已有的 ID。`location.update` 取代写下当前版本的记录，所以读过该版本的每条记录都会过期。`dv_proj_state` 中 `location` 的字段是 `locations`：每个 ID 的最新版本。

-----

<a id="understand-the-implementation"></a>
## 理解实现

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | `dvLocation` 服务的 `defineReference` 声明 |
| [`src/types.ts`](src/types.ts) | 客户端类型入口 `@dv/location/types`：`LocationId`、`Location`、`LocationState`，以及它们并入 `@dv/project/types` 的声明 |
| [`skills/location/SKILL.md`](skills/location/SKILL.md) | skill `location` |

-----

<a id="further-exploration"></a>
## 延伸阅读

- [`@dv/reference-kit`](../reference-kit/README.zh.md)：`defineReference` 注册的内容。
- [`@dv/ui-location`](../ui-location/README.zh.md)：场景组件的浏览器半边。

-----

<a id="model-experience"></a>
## 模型体验

### 工具定义

#### 模型看到什么

两个工具 `dv_location_create` 和 `dv_location_update`，格式与 `@dv/project` 给每个操作工具的一样。每个工具接受名为 `location` 的 ID 参数、`name`、`description`（"Words carried into every prompt: wardrobe, mood, or look."），以及带素材 ID 的 `inputs.reference`。创建工具的描述说明场景是镜头发生的地点、镜头以输入 `<location>@1` 指明它，以及 ID 不得已用于其他引用种类的条目；更新工具的描述说明下一个版本保留调用未改的内容，并把用上一版本做出的一切标为过期。`dv_proj_state` 的 `locations` 字段列出每个场景的最新版本，skill `location` 说明这些参数。

#### Token 影响

两个定义约 600 个 token，插件挂载期间固定不变；`@dv/project` 的共享参数让每个定义多约 200 个 token。

#### KV Cache 影响

这些定义位于每次智能体请求中固定的工具部分；挂载或移除插件会改变工具列表，使缓存前缀从工具部分起失效。

### 工具结果

#### 模型看到什么

一次调用返回一个文本块：`done <record>: location Harbor created`（更新时为 `location l1 updated`）和参数。被拒绝的 ID 返回说明原因的工具错误，例如 "The ID 'l1' already names a style; update it, or choose another ID." 或 "Unknown location 'l9'."

#### Token 影响

每次调用约 50 个 token。

#### KV Cache 影响

结果在调用之后追加到对话中；已缓存的前缀保持不变。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不读旧记录** —— 没有归约函数读取旧项目的 `bible.*` 记录，所以这样的项目不显示场景。
