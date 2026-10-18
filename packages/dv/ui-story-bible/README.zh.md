---
description: "DreamVerse 故事设定的浏览器半边：画布节点种类，把每个角色、场景和风格按最新版本画出来；引用种类 character、location 和 style 的版本种类；以及最新版本用作引用的输出所属的记录。"
kind: "package-reference"
---

# @dv/ui-story-bible

[English](README.md) | 中文

## 概述

使用本包在 `@dv/ui-canvas` 的画布上显示故事设定（`@dv/story-bible`）。它在 `dvCanvas` 中注册一个节点种类，把每个角色、场景和风格按最新版本画成节点 `bible:<id>`；为引用种类 `character`、`location` 和 `style` 各注册一个版本种类；再注册一个 `TakesInUse`，让被最新版本用作参考的生成结果（画布上的 `take` 节点）留在画布上。画布只通过已注册的版本种类读取带版本的条目：从条目连到读取它某个版本的 `take` 节点的边、版本编辑器的参考标签、素材选择窗口提供的条目，以及分镜计划编辑器的参考列表。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在叠了 `dsh-web-app`、`@dv/api`、`@dv/story-bible` 和 `@dv/ui-canvas` 的 profile 里挂载插件，先用 `pnpm run build` 构建浏览器 bundle（写出 `lib/client.js`）。

```yaml
- id: dv-ui-story-bible
  name: '@dv/ui-story-bible'
```

| 描述符 | 注册表 | 值 |
| --- | --- | --- |
| `bibleNodeKind` | `dvCanvas.nodeKinds` | `id: '@dv/ui-story-bible'`，`kind: 'bible'`，第 0 列，角色颜色；每个有版本的条目一个 seed，先角色，再场景，再风格：ID 为 `bible:<id>`，标签为界面语言的 角色 / Character、场景 / Location 或 风格 / Style，最新版本的名称（否则为条目 ID）作标题、它的引用作媒体，写出它的记录，以及更早版本的记录 |
| `bibleVersionKinds` | `dvCanvas.versionKinds` | 种类 `character`、`location`、`style` 各一项：`node(id)` 为 `bible:<id>`；`latest` 列出每个条目的最新版本；`name` 和 `assets` 给出某个版本的名称和引用，未知版本给出 null 和 `[]` |
| `bibleReferencesInUse` | `dvCanvas.takesInUse` | `id: '@dv/ui-story-bible'`；`uses` 给出创建每个最新版本的每个引用的记录 |

Host 半边不注册任何东西。浏览器半边在 `ctx.inject(['dvCanvas'], …)` 内注册这五个描述符，所以没有该服务时也能加载，每个描述符随服务或随插件一起移除。

-----

<a id="understand-the-implementation"></a>
## 理解实现

每个描述符读取线上状态的 `bible` 切片和 `proj` 记录，类型取自 `@dv/ui-kit/types.ts` 的客户端副本 `StoryBibleState`。`@dv/ui-canvas` 的默认卡片画出每个 seed：种类圆点、seed 的标签、第一个图片或视频引用（40 × 40，多出的显示 "+N"）和标题。seed 没有副标题，所以卡片不显示描述。

| 文件 | 内容 |
| --- | --- |
| [`src/index.ts`](src/index.ts) | 不做事的 Host Loader 入口 |
| [`src/client/index.ts`](src/client/index.ts) | `bibleNodeKind`、`bibleVersionKinds`、`bibleReferencesInUse` 及其注册 |

-----

<a id="further-exploration"></a>
## 进一步探索

- [`@dv/story-bible`](../story-bible/README.zh.md)：`bible` 切片和引用种类 `character`、`location`、`style`。
- [`@dv/ui-canvas`](../ui-canvas/README.zh.md)：画布如何画 seed，如何通过版本种类读取带版本的条目。
- [`@dv/ui-kit`](../ui-kit/README.zh.md)：`NodeKind`、`NodeSeed`、`VersionKind` 和 `TakesInUse` 描述符类型。

-----

<a id="model-experience"></a>
## 模型体验

无；本包不向模型发送任何内容。

#### KV Cache 影响

无；本包不向模型发送任何内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **编辑器在画布里** — `bible` 节点的编辑器由 `@dv/ui-canvas` 画出：它通过版本种类读取条目，用 `bible.<kind>_update` 修改引用，不显示描述，因为 seed 和版本种类都不带描述。
- **复制的切片类型** — 本包通过 `@dv/ui-kit/types.ts` 的客户端副本 `StoryBibleState` 读取 `bible` 切片，而不是 `@dv/story-bible` 的客户端类型。
